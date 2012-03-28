var PrimaryFetcher;

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
    this._loop = null;
  },

  fetchTweets: function()
  {
    Co.Routine(this,
      function()
      {
        return this._account.userInfo || this._auth.login();
      },
      function(r)
      {
        r = r();
        if (!PrimaryFetcher)
        {
          PrimaryFetcher = this;
        }
        this.emit("login", { screen_name: r.screen_name, user_id: r.user_id });

        this.fetchAbort();
        this._startFetchLoop();
      }
    );
  },

  fetchAbort: function()
  {
    if (this._loop)
    {
      this._loop.terminate = true;
      this._loop.abort && this._loop.abort("terminate");
      this._loop = null;
    }
  },

  _startFetchLoop: function()
  {
    this._loop = this._runUserStreamer();
    var running = false;
    var tweets;
    var tweetId = "1";
    var mentionId = "1";
    var favId = "1";
    var dmSendId = "1";
    var dmRecvId = "1";
    var failed;
    Co.Forever(this,
      function()
      {
        if (this._loop.terminated)
        {
          return Co.Break();
        }

        failed = false;
        tweets = [];

        this.emit("fetchStatus", true);
        this.emit("networkActivity", true);

        var lists = this._account.tweetLists;
        return Co.Loop(this, 4,
          function(page)
          {
            return this._ajaxWithRetry(
            {
              method: "GET",
              url: "https://api.twitter.com/1/statuses/home_timeline.json?include_entities=true&count=200&page=" + (1 + page()) + "&since_id=" + tweetId,
              auth: this._auth,
              proxy: networkProxy
            });
          },
          function(r)
          {
            var ntweets = r().json();
            tweets = tweets.concat(ntweets);
            if (!ntweets.length)
            {
              return Co.Break();
            }
            for (var i = ntweets.length - 1; i >= 0; i--)
            {
              if (lists.getTweet(ntweets[i].id_str))
              {
                return Co.Break();
              }
            }
            return true;
          }
        );
      },
      function(r)
      {
        try
        {
          r();
          if (tweets.length)
          {
            tweetId = tweets[0].id_str;
          }
        }
        catch (e)
        {
          failed = true;
          Log.exception("Tweet fetch failed", e);
        }

        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/favorites.json?include_entities=true&count=200&since_id=" + favId,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        try
        {
          var json = r().json();
          if (json.length)
          {
            favId = json[0].id_str;
          }
          tweets = tweets.concat(json);
        }
        catch (e)
        {
          failed = true;
          Log.exception("Fav fetch failed", e);
        }

        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/statuses/mentions.json?include_entities=true&count=200&since_id=" + mentionId,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        try
        {
          var json = r().json();
          if (json.length)
          {
            mentionId = json[0].id_str;
          }
          tweets = tweets.concat(json);
        }
        catch (e)
        {
          failed = true;
          Log.exception("Mentions fetch failed", e);
        }

        return Co.Parallel(this,
          function()
          {
            return this._ajaxWithRetry(
            {
              method: "GET",
              url: "https://api.twitter.com/1/direct_messages.json?include_entities=true&count=100&since_id=" + dmRecvId,
              auth: this._auth,
              proxy: networkProxy
            });
          },
          function()
          {
            return this._ajaxWithRetry(
            {
              method: "GET",
              url: "https://api.twitter.com/1/direct_messages/sent.json?include_entities=true&count=100&since_id=" + dmSendId,
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
          var recv = r[0].json();
          var send = r[1].json();
          if (recv.length)
          {
            dmRecvId = recv[0].id_str;
          }
          if (send.length)
          {
            dmSendId = send[0].id_str;
          }
          tweets = tweets.concat(recv, send);
        }
        catch (e)
        {
          failed = true;
          Log.exception("DM fetch failed", e);
        }

        this.emit("networkActivity", false);

        Log.time("TweetSort");
        tweets.sort(Tweet.compareRawTweets);
        Log.timeEnd("TweetSort");
        Log.time("TweetLoad");
        this.emit("tweets", tweets);
        Log.timeEnd("TweetLoad");

        this.emit("fetchStatus", !failed);

        if (!running)
        {
          running = true;
          this._loop.run();
        }
        return Co.Sleep(120);
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
      proxy: networkProxy,
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
                  tweets.unshift(line.direct_message);
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
    this.abortSearch();
    this._searchLoop = this._runSearchStreamer([ query ]);

    var config =
    {
      method: "GET",
      url: "https://search.twitter.com/search.json?include_entities=true&rpp=100&q=" + encodeURIComponent(query),
      auth: this._auth,
      proxy: networkProxy
    };
    return Co.Routine(this,
      function()
      {
        return this._ajaxWithRetry(config);
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
        this._searchLoop.run();
        return true;
      }
    );
  },

  abortSearch: function()
  {
    if (this._searchLoop)
    {
      this._searchLoop.terminate = true;
      this._searchLoop.abort && this._searchLoop.abort("terminate");
      this._searchLoop = null;
    }
  },

  _runSearchStreamer: function(query)
  {
    var self = this;
    var pending = "";
    var count = 0;
    var timer = null;
    var config =
    {
      method: "GET",
      url: "https://stream.twitter.com/1/statuses/filter.json?track=" + query.map(encodeURIComponent).join(","),
      auth: this._auth,
      proxy: networkProxy,
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
        var searches = [];
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
              if (line.text)
              {
                searches.unshift(line);
              }
            }
            catch (e)
            {
              Log.exception("Bad stream data", e);
            }
          }
        }

        searches.length && self.emit("searches", searches);

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

  tweet: function(m)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/update.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "status=" + encodeURIComponent(m.text())
    });
  },

  retweet: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/retweet/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  reply: function(m)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/update.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "status=" + encodeURIComponent(m.text()) + "&in_reply_to_status_id=" + m.replyId()
    });
  },

  dm: function(m)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/direct_messages/new.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "text=" + encodeURIComponent(m.text()) + "&screen_name=" + encodeURIComponent(m.target())
    });
  },

  favorite: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/favorites/create/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  unfavorite: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/favorites/destroy/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  follow: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/friendships/create.json?user_id=" + id,
      auth: this._auth,
      proxy: networkProxy
    });
  },

  unfollow: function(id)
  {
    return this._ajaxWithRetry(
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
        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/users/show.json?include_entities=true&" + key,
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
        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/friendships/show.json?source_id=" + this._account.userInfo.user_id + "&" + key,
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

  suggestions: function(slug)
  {
    return Co.Routine(this,
      function()
      {
        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/users/suggestions" + (slug ? "/" + slug : "") + ".json",
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

  _ajaxWithRetry: function(config)
  {
    this.emit("networkActivity", true);
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
          this.emit("networkActivity", false);
          return Co.Break(r());
        }
        catch (e)
        {
          if (retry > 4)
          {
            this.emit("networkActivity", false);
            throw e;
          }
          else
          {
            Co.Sleep(retry * 0.25);
            retry <<= 1;
          }
        }
      }
    );
  }
});
