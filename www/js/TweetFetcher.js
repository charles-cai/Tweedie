var TweetFetcher = xo.Class(Events,
{
  constructor: function(account, config)
  {
    if (!KEYS.twitter)
    {
      throw new Error("Missing twitter KEYS");
    }
    this._auth = new xo.OAuthLogin(
    {
      oauth_consumer_key: KEYS.twitter.oauth_consumer_key,
      oauth_consumer_secret: KEYS.twitter.oauth_consumer_secret,
      callback: KEYS.twitter.callback,
      oauth_token: config.oauth && config.oauth.oauth_token,
      oauth_token_secret: config.oauth && config.oauth.oauth_token_secret,

      request: { POST: "https://api.twitter.com/oauth/request_token" },
      authorize: { GET: "https://api.twitter.com/oauth/authorize?force_login=true" },
      access: { POST: "https://api.twitter.com/oauth/access_token" },

      proxy: networkProxy
    });
    this._account = account;
    this._userInfo = config.userInfo;
  },

  fetchTweets: function()
  {
    Co.Routine(this,
      function()
      {
        Co.Sleep(1);
      },
      function()
      {
        return this._userInfo || this._auth.login();
      },
      function(r)
      {
        r = r();
        this.emit("login", { screen_name: r.screen_name, user_id: r.user_id });

        var self = this;
        var loop = self._startFetchLoop();
        document.addEventListener("online", function()
        {
          loop = self._startFetchLoop(loop);
        });
        document.addEventListener("resume", function()
        {
          loop = self._startFetchLoop(loop);
        });
      }
    );
  },

  _startFetchLoop: function(oldLoop)
  {
    if (oldLoop)
    {
      oldLoop.terminated = true;
      oldLoop.abort && oldLoop.abort("terminate");
    }
    var loop = this._runUserStreamer();
    var running = false;
    Co.Forever(this,
      function()
      {
        if (loop.terminated)
        {
          return Co.Break();
        }
        this.emit("networkActivity", true);

        var lists = this._account.tweetLists;

        var alltweets = [];
        return Co.Loop(this, 4,
          function(page)
          {
            return this._ajaxWithRetry(
            {
              method: "GET",
              url: "https://api.twitter.com/1/statuses/home_timeline.json?include_entities=true&count=200&page=" + (1 + page()),
              auth: this._auth,
              proxy: networkProxy
            });
          },
          function(r)
          {
            try
            {
              var tweets = r().json();
              alltweets = alltweets.concat(tweets);
              for (var i = tweets.length - 1; i >= 0; i--)
              {
                if (lists.getTweet(tweets[i].id_str))
                {
                  return Co.Break(alltweets);
                }
              }
            }
            catch (e)
            {
              Log.exception("Tweet fetch failed", e);
              // Stop as soon as we fail to avoid getting pages out-of-order
              return Co.Break(alltweets);
            }
            return alltweets;
          }
        );
      },
      function(tweets)
      {
        try
        {
          Log.time("TweetLoad");
          this.emit("tweets", tweets());
          Log.timeEnd("TweetLoad");
        }
        catch (e)
        {
          Log.exception("Tweet add failed", e);
        }

        return Ajax.create(
        {
          method: "GET",
          url: "https://api.twitter.com/1/favorites.json?include_entities=true&count=100",
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        try
        {
          Log.time("FavLoad");
          this.emit("favs", r().json());
          Log.timeEnd("FavLoad");
        }
        catch (e)
        {
          Log.exception("Fav fetch failed", e);
        }

        return Co.Parallel(this,
          function()
          {
            return Ajax.create(
            {
              method: "GET",
              url: "https://api.twitter.com/1/direct_messages.json?include_entities=true&count=100",
              auth: this._auth,
              proxy: networkProxy
            });
          },
          function()
          {
            return Ajax.create(
            {
              method: "GET",
              url: "https://api.twitter.com/1/direct_messages/sent.json?include_entities=true&count=100",
              auth: this._auth,
              proxy: networkProxy
            });
          }
        );
      },
      function(r)
      {
        try
        {
          r = r();
          var msgs = r[0].json().concat(r[1].json());
          msgs.sort(function(a, b)
          {
            return a.id_str === b._id_str ? 0 : a.id_str < b.id_str ? 1 : -1;
          });
          Log.time("DMLoad");
          this.emit("dms", msgs);
          Log.timeEnd("DMLoad");
        }
        catch (e)
        {
          Log.exception("DM fetch failed", e);
        }

        if (!running)
        {
          running = true;
          loop.run();
        }

        this.emit("networkActivity", false);
        return Co.Sleep(120);
      }
    );
    return loop;
  },
  
  _ajaxWithRetry: function(config)
  {
    var retry = 1;
    return Co.Forever(this,
      function()
      {
        return Ajax.create(config);
      },
      function(r)
      {
        try
        {
          return Co.Break(r());
        }
        catch (e)
        {
          if (retry > 4)
          {
            throw e;
          }
          else
          {
            Co.Sleep(retry);
            retry <<= 1;
          }
        }
      }
    );
  },
  
  _runUserStreamer: function()
  {
    var self = this;
    var friends = null;
    var pending = "";
    var count = 0;
    var timer = null;
    var config =
    {
      method: "GET",
      url: "https://userstream.twitter.com/2/user.json",
      auth: this._auth,
      proxy: streamProxy,
      onText: function(chunk)
      {
        count += chunk.length;
        if (count > 1024 * 1024)
        {
          return this.abort("toolong");
        }
        var offset = 0;
        pending += chunk;
        var lines = pending.split("\r");
        var tweets = [];
        var favs = [];
        var unfavs = [];
        var dms = [];
        for (var i = 0, len = lines.length - 1; i < len; i++)
        {
          var line = lines[i];
          offset += line.length + 1; // length + \r
          line = line.trim();
          if (line)
          {
            try
            {
              line = JSON.parse(line);
              if (!friends)
              {
                friends = line;
              }
              else
              {
                if (line.event)
                {
                  switch (line.event)
                  {
                    case "favorite": // event, created_at, source, target, target_object
                      favs.unshift(line.target_object);
                      break;
                    case "unfavorite":
                      unfavs.unshift(line.target_object);
                      break;
                    case "follow":
                    case "unfollow":
                    default:
                      break;
                  }
                }
                else if (line.friends)
                {
                }
                else if (line["delete"])
                {
                }
                else if (line.direct_message)
                {
                  dms.unshift(line.direct_message);
                }
                else if (line.text)
                {
                  tweets.unshift(line);
                }
              }
            }
            catch (e)
            {
              Log.exception("Bad stream data", e);
            }
          }
        }

        tweets.length && self.emit("tweets", tweets);
        dms.length && self.emit("dms", dms);
        favs.length && self.emit("favs", favs);
        unfavs.length && self.emit("unfavs", unfavs);

        pending = pending.substr(offset);
        if (timer)
        {
          clearTimeout(timer);
        }
        timer = setTimeout(function()
        {
          config.abort("timeout");
        }, 120000)
      },
      run: function()
      {
        Co.Forever(this,
          function()
          {
            return AjaxStream.create(config);
          },
          function(r)
          {
            var reason;
            try
            {
              reason = r().reason;
            }
            catch (e)
            {
              reason = e.reason;
            }
            switch (reason)
            {
              case "terminate":
                return Co.Break();

              case "toolong":
                Log.info("TooLong");
                return Co.Yield();

              case "timeout":
                Log.info("Timeout");
                return Co.Sleep(10);

              default:
                Log.info("Sleeping");
                return Co.Sleep(30);
            }
          }
        );
      }
    };
    return config;
  },

  fetchSearch: function(query)
  {
    var config =
    {
      method: "GET",
      url: "http://search.twitter.com/search.json?include_entities=true&rpp=100&q=" + escape(query),
      auth: this._auth,
      proxy: networkProxy
    };
    return Co.Routine(this,
      function()
      {
        return Ajax.create(config);
      },
      function(r)
      {
        try
        {
          var json = r().json();
          this.emit("searches", json.results);
        }
        catch (e)
        {
          Log.exception("fetchSearch", e);
        }
        return true;
      }
    );
  },

  tweet: function(tweet)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/update.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "status=" + escape(tweet.text())
    });
  },

  retweet: function(id)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/retweet/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  reply: function(m)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/update.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "status=" + escape(m.text()) + "&in_reply_to_status_id=" + m.replyId()
    });
  },

  dm: function(m)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/direct_messages/new.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "text=" + escape(m.text()) + "&screen_name=" + escape(m.screen_name())
    });
  },

  favorite: function(id)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/favorites/create/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  unfavorite: function(id)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/favorites/destroy/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  follow: function(id)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/friendships/create.json?user_id=" + id,
      auth: this._auth,
      proxy: networkProxy
    });
  },

  unfollow: function(id)
  {
    return Ajax.create(
    {
      method: "POST",
      url: "https://api.twitter.com/1/friendships/destroy.json?user_id=" + id,
      auth: this._auth,
      proxy: networkProxy
    });
  },

  profile: function(name, id)
  {
    var key = name ? "screen_name=" + name : "user_id=" + id;
    return Co.Routine(this,
      function()
      {
        return Ajax.create(
        {
          method: "GET",
          url: "http://api.twitter.com/1/users/show.json?include_entities=true&" + key,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        return r().json();
      }
    );
  },

  relationship: function(name, id)
  {
    var key = name ? "target_screen_name=" + name : "target_id=" + id;
    return Co.Routine(this,
      function()
      {
        return Ajax.create(
        {
          method: "GET",
          url: "http://api.twitter.com/1/friendships/show.json?source_id=" + this._userInfo.user_id + "&" + key,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        return r().json();
      }
    );
  }
});
