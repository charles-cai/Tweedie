var TweetLists = Class(
{
  constructor: function(account)
  {
    account.tweetLists = this;

    var main = new FilteredTweetsModel({ account: account, title: "Main", canEdit: true, canRemove: false, type: "tweets", name: "main", uuid: "00000000-0000-0000-0000-000000000001" });
    var photos = new FilteredTweetsModel({ account: account, title: "Media", canEdit: true, canRemove: false, type: "tweets", uuid: "00000000-0000-0000-0000-000000000002" });
    var fav = new FilteredTweetsModel({ account: account, title: "Favorites", canEdit: true, canRemoved: false, type: "favs", uuid: "00000000-0000-0000-0000-000000000003" });
    var dms = new FilteredTweetsModel({ account: account, title: "Messages", canEdit: true, canRemoved: false, type: "dms", uuid: "00000000-0000-0000-0000-000000000004" });
    var mentions = new FilteredTweetsModel({ account: account, title: "Mentions", canEdit: true, canRemoved: false, type: "tweets", uuid: "00000000-0000-0000-0000-000000000005" });

    main.addIncludeTag(Tweet.TweetTag);
    main.addIncludeTag(Tweet.RetweetTag);
    main.addExcludeTag(Tweet.FavoriteTag);
    photos.addIncludeTag(Tweet.PhotoTag);
    photos.addIncludeTag(Tweet.VideoTag);
    fav.addIncludeTag(Tweet.FavoriteTag);
    dms.addIncludeTag(Tweet.DMTag);
    mentions.addIncludeTag(Tweet.MentionTag);

    this._account = account;
    this.screenname = account.userInfo ? "@" + account.userInfo.screen_name : "@...";
    this.lists = new ModelSet(
    {
      models:
      [
        main,
        mentions,
        fav,
        dms,
        photos
      ]
    });

    this.store = account.storage("alltweets");

    this._types =
    {
      tweets: new IndexedModelSet({ key: "id", limit: 1000 }),
      mentions: new IndexedModelSet({ key: "id", limit: 100 }),
      favs: new IndexedModelSet({ key: "id", limit: 1000 }),
      dms: new IndexedModelSet({ key: "id", limit: 1000 }),
    };
  },

  createList: function(name)
  {
    var list = new FilteredTweetsModel({ account: this._account, title: name, uuid: xo.Uuid.create(), canEdit: true, canRemove: true });
    if (!list.isSearch())
    {
      this._refilter(list);
    }
    var last = list.tweets().models[0];
    list.lastRead(last && last.id());
    this.lists.append(list);
    this._save();
    list.restore(true);
    return list;
  },

  removeList: function(list)
  {
    if (list.canRemove())
    {
      this.lists.remove(list);
      list.remove();
      this._save();
    }
  },

  renameList: function(list, newName)
  {
    if (this.hasList(newName))
    {
      return false;
    }
    if (list.title() === newName)
    {
      return true;
    }
    list.title(newName);
    list._save();
    this._save();
  },

  hasList: function(name)
  {
    this.lists.forEach(function(list)
    {
      if (list.title() === name)
      {
        return true;
      }
    });
    return false;
  },

  addIncludeTag: function(list, tag)
  {
    list.addIncludeTag(tag);
    this._refilter(list);
  },

  addExcludeTag: function(list, tag)
  {
    list.addExcludeTag(tag)
  },

  removeIncludeTag: function(list, tag)
  {
    list.removeIncludeTag(tag);
    if (list.includeTags()[0].tag.key === "all")
    {
      this._refilter(list);
    }
  },

  removeExcludeTag: function(list, tag)
  {
    list.removeExcludeTag(tag);
    this._refilter(list);
  },

  changeType: function(list, type)
  {
    if (list.type(type) !== type)
    {
      this._refilter(list);
    }
  },

  changeViz: function(list, type)
  {
    list.viz(type);
  },

  _refilter: function(list)
  {
    Log.time("_refilter");
    var listtweets = list.tweets();
    listtweets.removeAll();
    if (!list.isSearch())
    {
      var tweets = [];
      for (var type in this._types)
      {
        tweets = tweets.concat(this._types[type].models);
      }
      listtweets.append(tweets);
    }
    Log.timeEnd("_refilter");
  },

  addTweets: function(type, tweets)
  {
    var include = [];
    var all = [];
    var mentions = [];
    return Co.Lock(this,
      function()
      {
        var urls = [];
        var target = this._types[type];
        tweets.forEach(function(twt)
        {
          var tweet = this.getTweet(twt.id_str);
          if (!tweet)
          {
            tweet = new Tweet(twt, this);
            if (tweet.is_retweet())
            {
              urls = urls.concat(tweet.retweet().urls());
            }
            else
            {
              urls = urls.concat(tweet.urls());
            }
            all.push(tweet);
            if (tweet.isMention())
            {
              mentions.push(tweet);
            }
          }
          else if (!target || !target.findByProperty("id", tweet.id()))
          {
            all.push(tweet);
          }
          switch (type)
          {
            case "tweets":
            case "searches":
            case "dms":
            default:
              break;
            case "favs":
              tweet.favorited(true);
              break;
            case "unfavs":
              tweet.favorited(false);
              break;
          }
          include.push(tweet);
        },this);
        if (all.length)
        {
          switch (type)
          {
            case "tweets":
            case "favs":
            case "searches":
              return Co.Routine(this,
                function()
                {
                  return this._account.expandUrls(urls);
                },
                function(r)
                {
                  var oembeds = r();
                  for (var i = all.length - 1; i >= 0; i--)
                  {
                    var tweet = all[i];
                    if (tweet.is_retweet())
                    {
                      tweet.retweet().oembeds(oembeds);
                    }
                    else
                    {
                      tweet.oembeds(oembeds);
                    }
                  }
                  if (target)
                  {
                    target.prepend(all);
                    this._types.mentions.prepend(mentions);
                    this._save();
                  }
                  return true;
                }
              );
              break;
            case "dms":
              if (target)
              {
                target.prepend(all);
                this._save();
              }
              return true;

            case "unfavs":
            default:
              return true;
          }
        }
        else
        {
          return true;
        }
      },
      function()
      {
        if (include.length)
        {
          var o = this._getVelocity();
          if (type === "searches")
          {
            this.lists.forEach(function(list)
            {
              if (list.isSearch())
              {
                list.addTweets(include);
                list.recalcVelocity(o);
              }
            });
          }
          else if (type.slice(0, 2) !== "un")
          {
            this.lists.forEach(function(list)
            {
              if (!list.isSearch())
              {
                list.addTweets(include);
                list.recalcVelocity(o);
              }
            });
          }
          else
          {
            this.lists.forEach(function(list)
            {
              if (!list.isSearch())
              {
                list.removeTweets(include);
                list.recalcVelocity(o);
              }
            });
          }
        }
        return all.length;
      }
    )
  },
  
  _getVelocity: function()
  {
    return {
      maxLength: 1000
    }
  },

  getTweet: function(id)
  {
    for (var type in this._types)
    {
      var tweet = this._types[type].findByProperty("id", id);
      if (tweet)
      {
        return tweet;
      }
    }
    return null;
  },

  _save: function()
  {
    var lists = [];
    this.lists.forEach(function(list)
    {
      if (list.canRemove())
      {
        lists.push({ title: list.title(), uuid: list.uuid() });
      }
    });
    var saves =
    {
      all: lists
    };
    for (var type in this._types)
    {
      saves[type] = this._types[type].serialize();
    }
    this.store.setAll(saves);
  },

  restore: function()
  {
    return Co.Routine(this,
      function(r)
      {
        var loads =
        {
          all: []
        };
        for (var type in this._types)
        {
          loads[type] = [];
        }
        return this.store.getAll(loads);
      },
      function(all)
      {
        all = all();
        all.all.forEach(function(listinfo)
        {
          this.lists.append(new FilteredTweetsModel({ account: this._account, title: listinfo.title, uuid: listinfo.uuid, canRemove: true, canEdit: true }));
        }, this);
        for (var type in this._types)
        {
          all[type].forEach(function(tweet)
          {
            this._types[type].append(this.getTweet("id", tweet.id_str) || new Tweet(tweet, this));
          }, this);
        }

        return Co.Foreach(this, this.lists.models,
          function(list)
          {
            return list().restore();
          }
        );
      }
    );
  }
});
