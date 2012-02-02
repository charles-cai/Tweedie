var Account = Class(Events,
{
  _store: new Storage("accounts"),

  constructor: function(userInfo)
  {
    this.tweetLists = new TweetLists(this);
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
        this._fetcher.fetchTweets();
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

  tweet: function(tweet)
  {
    return this._fetcher.tweet(tweet);
  },

  retweet: function(id)
  {
    return this._fetcher.retweet(id);
  },

  reply: function(tweet)
  {
    return this._fetcher.reply(tweet);
  },

  dm: function(tweet)
  {
    return this._fetcher.dm(tweet);
  },

  favorite: function(tweet)
  {
    this.tweetLists.addTweets("favs", [ tweet.serialize() ]);
    return this._fetcher.unfavorite(tweet.id());
  },

  unfavorite: function(tweet)
  {
    this.tweetLists.addTweets("unfavs", [ tweet.serialize() ]);
    return this._fetcher.unfavorite(tweet.id());
  },

  search: function(query)
  {
    return this._fetcher.fetchSearch(query);
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
