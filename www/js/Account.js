var Account = Class(Events,
{
  constructor: function(userInfo)
  {
    this._lgrid = grid.get();
    this.tweetLists = new TweetLists(this);
    this.errors = new Errors(this);
    this.userAndTags = new UsersAndTags(this);
  },

  open: function()
  {
    return Co.Routine(this,
      function()
      {
        return this._lgrid.read("/accounts");
      },
      function(info)
      {
        try
        {
          info = info() || [ {} ];
        }
        catch (e)
        {
          Log.exception("No account info", e);
          info = [ {} ];
        }
        this._expander = new UrlExpander();
        this._expander.on("networkActivity", function(evt, activity)
        {
          var v = RootView.getViewByName("activity");
          v.property("activity", Math.max(0, (v.property("activity") || 0) + (activity ? 1 : -1)));
        });

        info = info[0]; // First account only for now
        this.userInfo = info.userInfo
        if (this.userInfo && this.userInfo.screen_name)
        {
          this.tweetLists.screenname = "@" + this.userInfo.screen_name;
          this.emit("screenNameChange");
        }
        this._fetcher = new TweetFetcher(this, info);
        this._fetcher.on("login", function(evt, info)
        {
          this.errors.open();
          this._fetcher.on("fetchStatus", function(evt, statuses)
          {
            this.errors.remove(this.errors.find("fetch"));
            statuses.forEach(function(status)
            {
              this.errors.add(status.op, status.type, status.details);
            }, this);
          }, this);
          if (!this.userInfo || info.screen_name !== this.userInfo.screen_name || info.user_id !== this.userInfo.user_id)
          {
            this.userInfo = info;
            this.tweetLists.screenname = "@" + info.screen_name;
            this.emit("screenNameChange");
            this._lgrid.write("/accounts", this.serialize());
          }
          this.emit("opened");
        }, this);

        Topics.open();

        return this.tweetLists.restore();
      },
      function()
      {
        this._fetcher.on("tweets", function(evt, tweets)
        {
          this.tweetLists.addTweets(tweets);
        }, this);
        this._fetcher.on("searches", function(evt, tweets)
        {
          this.tweetLists.addSearch(tweets);
        }, this);
        this._fetcher.on("favs", function(evt, tweets)
        {
          this.tweetLists.favTweets(tweets);
        }, this);
        this._fetcher.on("unfavs", function(evt, tweets)
        {
          this.tweetLists.unfavTweets(tweets);
        }, this);
        this._fetcher.on("networkActivity", function(evt, activity)
        {
          var v = RootView.getViewByName("activity");
          v.property("activity", Math.max(0, (v.property("activity") || 0) + (activity ? 1 : -1)));
        }, this);

        var self = this;
        function online()
        {
          self._fetcher.abortFetch();
          self._fetcher.abortSearch();
          self.fetch();
        }
        function offline()
        {
          self._fetcher.abortFetch();
          self._fetcher.abortSearch();
        }
        document.addEventListener("online", online);
        document.addEventListener("offline", offline);
        document.addEventListener("resume", online);
        document.addEventListener("pause", offline);
        this.fetch();

        return true;
      }
    );
  },

  expandUrls: function(urls)
  {
    return this._expander.expand(urls);
  },

  fetch: function()
  {
    this.errors.remove(this.errors.find("fetch"));
    this._fetcher.fetchTweets();
  },

  tweet: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.tweet(tweet);
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("tweet", "tweet", tweet);
        }
      }
    );
  },

  retweet: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.retweet(tweet.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("retweet", "retweet", tweet);
          return null;
        }
      }
    );
  },

  reply: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.reply(tweet);
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("reply", "reply", tweet);
          return null;
        }
      }
    );
  },

  dm: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.dm(tweet);
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("dm", "dm", tweet);
          return null;
        }
      }
    );
  },

  favorite: function(tweet)
  {
    this.tweetLists.favTweets([ tweet.serialize() ]);
    return Co.Routine(this,
      function()
      {
        return this._fetcher.favorite(tweet.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("favorite", "favorite", tweet);
          return null;
        }
      }
    );
  },

  unfavorite: function(tweet)
  {
    this.tweetLists.unfavTweets([ tweet.serialize() ]);
    return Co.Routine(this,
      function()
      {
        return this._fetcher.unfavorite(tweet.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("unfavorite", "unfavorite", tweet);
          return null;
        }
      }
    );
  },
  
  follow: function(user)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.follow(user.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("follow", "follow", user);
          return null;
        }
      }
    );
  },

  unfollow: function(user)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.unfollow(user.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("unfollow", "unfollow", user);
          return null;
        }
      }
    );
  },

  search: function(query)
  {
    return this._fetcher.fetchSearch(query);
  },

  serialize: function()
  {
    return [{
      version: 1,
      oauth: this._fetcher._auth.serialize(),
      userInfo: this.userInfo
    }];
  }
});
