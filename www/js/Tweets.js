var FilteredTweetsModel = Model.create(
{
  uuid: Model.Property,
  title: Model.Property,
  name: Model.Property,
  canEdit: Model.Property,
  canRemove: Model.Property,
  tweets: Model.Property,
  unread: Model.Property,
  velocity: Model.Property,
  lastRead: Model.Property,
  viz: Model.Property,

  constructor: function(__super, values)
  {
    var self = this;
    __super(values);
    self.tweets(new FilteredModelSet({ key: "id", limit: values.limit || 1000 }));
    self.unread(0);
    self.velocity(0);
    self._includeTags = [];
    self._excludeTags = [];
    self._store = values.account.storage("tweets_" + self.uuid());
    self._tweetLists = values.account.tweetLists;
    self.viz("list");
  },

  restore: function(isNew)
  {
    return Co.Routine(this,
      function()
      {
        return isNew || this._restore();
      },
      function()
      {
        this.on("update", function()
        {
          this._save();
        }, this);
        this._updateUnread();
        return true;
      }
    );
  },

  addTweets: function(tweets)
  {
    var otweets = this.tweets();
    var ntweets = [];
    tweets.forEach(function(twt)
    {
      if (!otweets.findByProperty("id", twt.id()))
      {
        ntweets.push(twt);
      }
    });
    this.tweets().prepend(ntweets);
    this._save();
  },

  removeTweets: function(tweets)
  {
    this.tweets().remove(tweets);
    this._save();
  },

  addIncludeTag: function(tag)
  {
    if (this._tagIndex(this._includeTags, tag) === -1)
    {
      var filter = this._makeRule(tag);
      this._includeTags.push({ tag: tag, filter: filter });
      this.tweets().addIncludeFilter(filter);
      this.emit("update");
    }
  },

  addExcludeTag: function(tag)
  {
    if (this._tagIndex(this._excludeTags, tag) === -1)
    {
      var filter = this._makeRule(tag);
      this._excludeTags.push({ tag: tag, filter: filter });
      this.tweets().addExcludeFilter(filter);
      this.emit("update");
    }
  },

  removeIncludeTag: function(tag)
  {
    var idx = this._tagIndex(this._includeTags, tag);
    if (idx !== -1)
    {
      var e = this._includeTags.splice(idx, 1);
      this.tweets().removeIncludeFilter(e[0].filter);
      this.emit("update");
    }
  },

  removeExcludeTag: function(tag)
  {
    var idx = this._tagIndex(this._excludeTags, tag);
    if (idx !== -1)
    {
      var e = this._excludeTags.splice(idx, 1);
      this.tweets().removeExcludeFilter(e[0].filter);
      this.emit("update");
    }
  },

  isSearch: function()
  {
    return this.title().slice(-1) === "?";
  },

  _tagIndex: function(list, tag)
  {
    for (var i = list.length - 1; i >= 0; i--)
    {
      if (list[i].tag.type === tag.type && list[i].tag.key === tag.key)
      {
        return i;
      }
    }
    return -1;
  },

  _makeRule: function(tag)
  {
    if (tag.type === "search")
    {
      return function()
      {
        return true;
      };
    }
    else
    {
      var key = tag.type + ":" + tag.key;
      return function(tweet)
      {
        return tweet.hasTagKey(key);
      };
    }
  },

  _defaultAll: [{ tag: { title: "All", type: "default", key: "all" } }],
  _defaultNone: [{ tag: { title: "None", type: "default", key: "none" } }],

  includeTags: function()
  {
    return this._includeTags.length ? this._includeTags : this._defaultAll;
  },

  excludeTags: function()
  {
    return this._excludeTags.length ? this._excludeTags : this._defaultNone;
  },

  hotness: function()
  {
    var v = this.velocity();
    if (v === 0 || v === 1)
    {
      return 100;
    }
    else if (v > 0.5)
    {
      return 95;
    }
    else if (v > 0.1)
    {
      return 90;
    }
    else if (v > 0.05)
    {
      return 85;
    }
    else if (v > 0.01)
    {
      return 80;
    }
    else if (v > 0.005)
    {
      return 75;
    }
    else
    {
      return 50;
    }
  },

  recalcVelocity: function(o)
  {
    this.velocity(this.unread() ? this.tweets().models.length / o.maxLength : 0);
  },

  _updateUnread: function()
  {
    var id = this.lastRead();
    var tweets = this.tweets();
    var model = tweets.findByProperty("id", id);
    this.unread(model ? Math.max(0, tweets.indexOf(model)) : tweets.length());
  },

  remove: function()
  {
    this._store.setAll(
    {
      includeTags: null,
      excludeTags: null,
      tweets: null,
      type: null,
      lastRead: null,
      viz: null,
    });
  },

  _save: function()
  {
    this._updateUnread();
    this._store.setAll(
    {
      includeTags: this._includeTags,
      excludeTags: this._excludeTags,
      tweets: this.tweets().serialize().map(function(tweet)
      {
        return tweet.id_str;
      }),
      lastRead: this.lastRead(),
      viz: this.viz()
    });
  },

  _restore: function()
  {
    return Co.Routine(this,
      function(r)
      {
        return this._store.getAll(
        {
          tweets: [],
          lastRead: null,
          viz: this.viz() || "list",
          includeTags: [],
          excludeTags: [],
        });
      },
      function(keys)
      {
        keys = keys();
        this.viz(keys.viz);
        keys.includeTags.forEach(function(t)
        {
          this.addIncludeTag(t.tag);
        }, this);
        keys.excludeTags.forEach(function(t)
        {
          this.addExcludeTag(t.tag);
        }, this);
        var tweets = [];
        var lists = this._tweetLists;
        keys.tweets.forEach(function(id)
        {
          var tweet = lists.getTweet(id);
          if (tweet)
          {
            tweets.push(tweet);
          }
        }, this);
        this.addTweets(tweets);
        this.lastRead(keys.lastRead);
        this.recalcVelocity(this._tweetLists._getVelocity());
        return true;
      }
    );
  }
});
