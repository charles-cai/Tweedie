var FilteredTweetsModel = Model.create(
{
  uuid: Model.Property,
  title: Model.Property,
  name: Model.Property,
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
    self._lgrid = grid.get();
    self.tweets(new FilteredModelSet({ key: "id", limit: values.limit || 1000 }));
    self.unread(0);
    self.velocity(0);
    self._includeTags = [];
    self._excludeTags = [];
    self._tweetLists = values.account.tweetLists;
    self.viz(self.viz() || "list");
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
        this._updateUnread();
        this.on("update.tweets update.includeTags update.excludeTags update.lastRead update.viz", function()
        {
          this._save();
        }, this);
        return true;
      }
    );
  },

  addTweets: function(tweets)
  {
    var ntweets;
    var otweets = this.tweets();
    if (otweets.length() === 0)
    {
      ntweets = tweets;
    }
    else
    {
      ntweets = [];
      tweets.forEach(function(twt)
      {
        if (!otweets.findByProperty("id", twt.id()))
        {
          ntweets.push(twt);
        }
      });
    }
    if (ntweets.length)
    {
      if (this.tweets().prepend(ntweets))
      {
        this.emit("update.tweets");
        this.emit("update");
      }
    }
  },

  removeTweets: function(tweets)
  {
    if (tweets.length)
    {
      if (this.tweets().remove(tweets))
      {
        this.emit("update.tweets");
        this.emit("update");
      }
    }
  },

  addIncludeTag: function(tag, refilter)
  {
    if (this._tagIndex(this._includeTags, tag) === -1)
    {
      var filter = this._makeRule(tag);
      this._includeTags.push({ tag: tag, filter: filter });
      this.tweets().addIncludeFilter(filter, refilter);
      this.emit("update.includeTags");
      this.emit("update");
    }
  },

  addExcludeTag: function(tag, refilter)
  {
    if (this._tagIndex(this._excludeTags, tag) === -1)
    {
      var filter = this._makeRule(tag);
      this._excludeTags.push({ tag: tag, filter: filter });
      this.tweets().addExcludeFilter(filter, refilter);
      this.emit("update.excludeTags");
      this.emit("update");
    }
  },

  removeIncludeTag: function(tag, refilter)
  {
    var idx = this._tagIndex(this._includeTags, tag);
    if (idx !== -1)
    {
      var e = this._includeTags.splice(idx, 1);
      this.tweets().removeIncludeFilter(e[0].filter, refilter);
      this.emit("update.includeTags");
      this.emit("update");
    }
  },

  removeExcludeTag: function(tag, refilter)
  {
    var idx = this._tagIndex(this._excludeTags, tag);
    if (idx !== -1)
    {
      var e = this._excludeTags.splice(idx, 1);
      this.tweets().removeExcludeFilter(e[0].filter, refilter);
      this.emit("update.excludeTags");
      this.emit("update");
    }
  },

  isSearch: function()
  {
    return this.title().slice(-1) === "?";
  },

  asSearch: function()
  {
    if (!this.isSearch())
    {
      return null;
    }
    else
    {
      return this.title().slice(0, -1);
    }
  },

  isDM: function()
  {
    var tags = this.includeTags();
    return tags.length === 1 && tags[0].tag.type === Tweet.DMTag.type;
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
    var key = tag.type + ":" + tag.key;
    return function(tweet)
    {
      return tweet.hasTagKey(key);
    };
  },

  _defaultAll: [{ tag: { title: "All", type: "default", key: "all", hashkey: "default:all" } }],
  _defaultNone: [{ tag: { title: "None", type: "default", key: "none", hashkey: "default:none" } }],

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
    this.velocity(this.unread() ? this.tweets().length() / o.maxLength : 0);
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
    return this._lgrid.remove("/tweetlist/0/" + this.uuid());
  },

  _save: function()
  {
    this._updateUnread();
    this._lgrid.write("/tweetlist/0/" + this.uuid(),
    {
      includeTags: this._includeTags,
      excludeTags: this._excludeTags,
      tweets: this.tweets().serialize().map(function(tweet) { return tweet.id_str; }),
      lastRead: this.lastRead(),
      vis: this.viz()
    });
  },

  _restore: function()
  {
    return Co.Routine(this,
      function(r)
      {
        return this._lgrid.read("/tweetlist/0/" + this.uuid());
      },
      function(vals)
      {
        this.delayUpdate(function()
        {
          vals = vals() || {};

          this.viz(vals.viz || this.viz());
          var tweets = [];
          var lists = this._tweetLists;
          (vals.tweets || []).forEach(function(id)
          {
            var tweet = lists.getTweet(id);
            if (tweet)
            {
              tweets.push(tweet);
            }
          }, this);
          this.addTweets(tweets);
          this.lastRead(vals.lastRead);
          this.recalcVelocity(this._tweetLists._getVelocity());
          (vals.includeTags || []).forEach(function(t)
          {
            this.addIncludeTag(t.tag, false);
          }, this);
          (vals.excludeTags || []).forEach(function(t)
          {
            this.addExcludeTag(t.tag, false);
          }, this);
        });
        return true;
      }
    );
  }
});
