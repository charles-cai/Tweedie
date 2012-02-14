var Account = Class(Events,
{
  _store: new Storage("accounts"),

  constructor: function(userInfo)
  {
    this.profiles = new ProfileManager(this);
    this.tweetLists = new TweetLists(this);
    this.errors = new Errors(this);
  },

  open: function()
  {
    return Co.Routine(this,
      function()
      {
        return this._store.get("accountInfo", {});
      },
      function(info)
      {
        try
        {
          info = info()
        }
        catch (e)
        {
          Log.exception("No account info", e);
          info = {};
        }
        this._expander = new UrlExpander();
        this._expander.on("networkActivity", function(evt, activity)
        {
          var v = RootView.getViewByName("activity");
          v.property("activity", Math.max(0, (v.property("activity") || 0) + (activity ? 1 : -1)));
        });
        if (info.userInfo && info.userInfo.screen_name)
        {
          this.tweetLists.screenname = "@" + info.userInfo.screen_name;
          this.emit("screenNameChange");
        }
        this._fetcher = new TweetFetcher(this, info);
        this._fetcher.on("login", function(evt, info)
        {
          this.userInfo = info;
          this.tweetLists.screenname = "@" + info.screen_name;
          this.emit("screenNameChange");
          this._store.set("accountInfo", this.serialize());
        }, this);

        return this.tweetLists.restore();
      },
      function()
      {
        this._fetcher.on("tweets favs unfavs searches dms", function(evt, tweets)
        {
          this.tweetLists.addTweets(evt, tweets);
        }, this);
        this._fetcher.on("networkActivity", function(evt, activity)
        {
          var v = RootView.getViewByName("activity");
          v.property("activity", Math.max(0, (v.property("activity") || 0) + (activity ? 1 : -1)));
        }, this);

        var self = this;
        function retry()
        {
          var fetch = self.errors.find("fetch");
          if (fetch.length)
          {
            self.errors.remove(fetch[0]);
          }
          self.fetch();
        }
        document.addEventListener("online", retry);
        document.addEventListener("resume", retry);
        this.fetch();

        return true;
      }
    );
  },

  storage: function(name)
  {
    return this._store.getSubStorage(name);
  },

  expandUrls: function(urls)
  {
    return this._expander.expand(urls);
  },

  fetch: function()
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.fetchTweets();
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("fetch");
        }
      }
    );
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
          this.errors.add("tweet", tweet);
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
          this.errors.add("retweet", tweet);
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
          this.errors.add("reply", tweet);
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
          this.errors.add("dm", tweet);
          return null;
        }
      }
    );
  },

  favorite: function(tweet)
  {
    this.tweetLists.addTweets("favs", [ tweet.serialize() ]);
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
          this.errors.add("favorite", tweet);
          return null;
        }
      }
    );
  },

  unfavorite: function(tweet)
  {
    this.tweetLists.addTweets("unfavs", [ tweet.serialize() ]);
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
          this.errors.add("unfavorite", tweet);
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
          this.errors.add("follow", user);
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
          this.errors.add("unfollow", user);
          return null;
        }
      }
    );
  },

  search: function(query)
  {
    return this._fetcher.fetchSearch(query);
  },

  profileByUser: function(user)
  {
    return this.profiles.profileByUser(user);
  },

  profileByName: function(name)
  {
    return this.profiles.profileByName(name);
  },

  serialize: function()
  {
    return {
      version: 1,
      oauth: this._fetcher._auth.serialize(),
      userInfo: this.userInfo
    };
  }
});
