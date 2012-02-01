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
    photos.addIncludeTag({ title: "Photo", type: "photo", key: "photo" });
    photos.addIncludeTag({ title: "Video", type: "video", key: "video" });
    mentions.addIncludeTag({ title: "Mention", type: "mention", key: "mention" });

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
      favs: new IndexedModelSet({ key: "id", limit: 1000 }),
      dms: new IndexedModelSet({ key: "id", limit: 1000 })
    };
  },

  createList: function(name, type)
  {
    var list = new FilteredTweetsModel({ account: this._account, title: name, uuid: xo.Uuid.create(), canEdit: true, canRemove: true, type: type });
    this._refilter(list, null);
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
    //this._refilter(list);
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
    var listtweets = list.tweets();
    listtweets.removeAll();
    var tweets = this._types[list.type()];
    tweets && tweets.forEach(function(tweet)
    {
      listtweets.append(tweet);
    });
  },

  addTweets: function(type, tweets, prepend)
  {
    var include = [];
    var all = [];
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
            tweet = new TweetModel(twt, this);
            if (tweet.is_retweet())
            {
              urls = urls.concat(tweet.retweet().urls());
            }
            else
            {
              urls = urls.concat(tweet.urls());
            }
            all.push(tweet)
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
                    this._save();
                  }
                  return true;
                }
              );
              break;
            case "searches":
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
          var o = this._getVelocity(type);
          this.lists.forEach(function(list)
          {
            if (type === list.type())
            {
              list.addTweets(include);
              list.recalcVelocity(o);
            }
            else if (type === "un" + list.type())
            {
              list.removeTweets(include);
              list.recalcVelocity(o);
            }
          });
        }
        return all.length;
      }
    )
  },
  
  _getVelocity: function(type)
  {
    var ttype = this._types[type];
    if (!ttype && type.slice(0, 2) === "un")
    {
      ttype = this._types[type.slice(2)];
    }
    return {
      maxLength: ttype ? ttype.models.length : 0
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
            this._types[type].append(this.getTweet("id", tweet.id_str) || new TweetModel(tweet, this));
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
