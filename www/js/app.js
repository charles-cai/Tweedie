var partials;

var editView = null;
var filterInput = null;

function main()
{
  Log.time("runtime");
  document.addEventListener("resume", function()
  {
    Log.time("runtime");
  });
  document.addEventListener("pause", function()
  {
    Log.timeEnd("runtime");
  });

  //navigator.splashscreen && navigator.splashscreen.show();

  var selectedListView = null;
  var lgrid = grid.get();

  var account = new Account();

  models = new (Model.create(
  {
    account: Model.Property,
    current_list: Model.Property,
    lists: Model.Property,
    name: function()
    {
      return account.tweetLists.screenname.slice(1);
    },
    filter: Model.Property
  }))(
  {
    account: account,
    current_list: account.tweetLists.lists.models[0],
    lists: account.tweetLists.lists,
    filter: ""
  });

  account.on("screenNameChange", function()
  {
    models.emit("update");
  });
  
  function selectList(m, v)
  {
    if (models.current_list() === m)
    {
      RootView.getViewByName("tweets").scrollToTop();
    }
    models.filter("");
    document.getElementById("filter").value = "";
    models.current_list(m);
    var last = m.tweets().models[0];
    m.lastRead(last && last.id());
    m.velocity(0);
    editList(null);
    if (selectedListView)
    {
      selectedListView.property("selected", false);
      selectedListView = null;
    }
    selectedListView = v;
    selectedListView.property("selected", true);
  }

  partials = __resources;
  var root = new RootView(
  {
    node: document.getElementById("root"),
    template: partials.main,
    partials: partials,
    model: models,
    properties:
    {
      open: true
    },
    controller:
    {
      onToggleShow: function()
      {
        Log.metric("lists", root.open() ? "close" : "open");
        root.open(!root.open());
      },
      onSelectList: function(m, v)
      {
        selectList(m, v);
        var query = m.asSearch();
        if (query)
        {
          Log.metric("lists", "select:search");
          account.search(query);
        }
        else
        {
          Log.metric("lists", "select:list");
        }
      },
      onDropToList: function(m, v)
      {
        Log.metric("tweet", "list:include:add")
        account.tweetLists.addIncludeTag(m, v.dropped());
      },
      onDropToNewList: function(m, v)
      {
        Log.metric("tweet", "list:new:drop");
        var listName = v.dropped().title;
        switch (v.dropped().type)
        {
          case "hashtag":
          case "somewhere":
            listName += "?";
            break;
          default:
            break;
        }
        var list = account.tweetLists.createList(listName);
        if (list && !list.isSearch())
        {
          account.tweetLists.addIncludeTag(list, v.dropped());
        }
      },
      onNewList: function(m, v, e)
      {
        Log.metric("global", "list:new:type");
        var listName = e.target.value;
        if (listName)
        {
          account.tweetLists.createList(listName);
        }
        e.target.value = "";
      },
      onEditList: function(m, v)
      {
        Log.metric("list", "edit");
        editList(v);
      },
      onRemoveList: function(m, v, e)
      {
        Log.metric("list", "remove");
        account.tweetLists.removeList(models.current_list());
        editList(null);
        models.current_list(account.tweetLists.lists.models[0]);
        selectedListView = RootView.getViewByName("main");
        selectedListView.property("selected", true);
      },
      onDropInclude: function(m, v)
      {
        Log.metric("list", "include:add");
        account.tweetLists.addIncludeTag(models.current_list(), v.dropped());
      },
      onDropExclude: function(m, v)
      {
        Log.metric("list", "exclude:add");
        account.tweetLists.addExcludeTag(models.current_list(), v.dropped());
      },
      onKillInclude: function(m)
      {
        if (editView && editView.property("editMode"))
        {
          Log.metric("list", "include:remove");
          account.tweetLists.removeIncludeTag(models.current_list(), m);
        }
      },
      onKillExclude: function(m)
      {
        if (editView && editView.property("editMode"))
        {
          Log.metric("list", "exclude:remove");
          account.tweetLists.removeExcludeTag(models.current_list(), m);
        }
      },
      onChangeViz: function(m, v, e)
      {
        Log.metric("list", "viz:change");
        account.tweetLists.changeViz(models.current_list(), e.target.value);
      },
      onOpenTweet: function(m, v, e)
      {
        var nested = v.node().querySelector(".nested-tweets");
        var open = v.property("tweet_open");
        if (open)
        {
          Log.metric("tweet", "nested:open");
          Co.Routine(this,
            function()
            {
              nested.style.height = 0;
              Co.Sleep(0.5);
            },
            function()
            {
              v.tweet_open(false);
            }
          );
        }
        else
        {
          Log.metric("tweet", "nested:close");
          Co.Routine(this,
            function()
            {
              nested.style.height = 0;
              v.tweet_open(true);
              Co.Yield();
            },
            function()
            {
              nested.style.height = nested.scrollHeight + "px";
            }
          );
        }
      },
      onUrl: function(m, v, e)
      {
        Log.metric("tweet", "url:open");
        var url = e.target.dataset.href;
        
        Co.Routine(this,
          function()
          {
            return lgrid.read("/readable=" + url);
          },
          function(readModel)
          {
            readModel = readModel();

            var pagenr = 0;
            var maxpagenr = 0;
            var mv = new ModalView(
            {
              node: document.getElementById("root-dialog"),
              template: partials.readability,
              partials: partials,
              model: readModel,
              properties:
              {
                pages: 0,
                pagenr: 0,
                translate: ""
              },
              controller:
              {
                onForward: function()
                {
                  Co.Routine(this,
                    function()
                    {
                      var r = document.querySelector("#readability-scroller .text");
                      pagenr = Math.min(maxpagenr - 1, pagenr + 1);
                      mv.translate("-webkit-transform: translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,1px)");
                      //mv.translate("-webkit-transform: translate(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0)");
                      Co.Sleep(0.2);
                    },
                    function()
                    {
                      mv.pagenr(pagenr);
                      Log.metric("readable", "page:forward", pagenr);
                    }
                  );
                },
                onBackward: function()
                {
                  Co.Routine(this,
                    function()
                    {
                      var r = document.querySelector("#readability-scroller .text");
                      pagenr = Math.max(0, pagenr - 1);
                      mv.translate("-webkit-transform: translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,1px)");
                      //mv.translate("-webkit-transform: translate(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0)");
                      Co.Sleep(0.2);
                    },
                    function()
                    {
                      mv.pagenr(pagenr);
                      Log.metric("readable", "page:backward", pagenr);
                    }
                  );
                },
                onOpenWeb: function()
                {
                  var browser = ChildBrowser.install();
                  browser.onClose = function()
                  {
                    mv.close();
                  };
                  browser.showWebPage(url);
                  Log.metric("readable", "browser:open");
                },
                onClose: function()
                {
                  Log.metric("readable", "close");
                  mv.close();
                }
              }
            });
            mv.addListener(mv.node(), "click", function(e)
            {
              e.preventDefault();
            });
            readModel.on("update", function()
            {
              Co.Routine(this,
                function()
                {
                  Co.Yield();
                },
                function()
                {
                  var r = document.querySelector("#readability-scroller .text");
                  var gap = parseInt(getComputedStyle(r).WebkitColumnGap);
                  var images = r.querySelectorAll("img");
                  function recalc()
                  {
                    maxpagenr = Math.ceil((r.scrollWidth + gap) / (r.offsetWidth + gap));
                    mv.pages(Math.min(10, maxpagenr));
                  }
                  function hide()
                  {
                    this.parentNode.removeChild(this);
                    recalc();
                  }
                  for (var i = 0; i < images.length; i++)
                  {
                    images[i].onload = recalc;
                    images[i].onerror = hide;
                  }
                  recalc();
                  mv.pagenr(0);
                }
              );
            }, this);
            // Force layout if we have text already (cached)
            if (readModel.text())
            {
              readModel.emit("update");
            }
          }
        );
      },
      onMedia: function(m, v, e)
      {
        Log.metric("tweet", "image:open");
        new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: partials.imageview,
          partials: partials,
          model:
          {
            url: e.target.dataset.href
          }
        });
      },
      onVideo: function(m, v, e)
      {
        Log.metric("tweet", "video:open");
        new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: partials.videoview,
          partials: partials,
          model:
          {
            embed: unescape(e.target.dataset.embed)
          }
        });
      },
      onComposeTweet: function()
      {
        Log.metric("global", "tweet:compose");
        openTweetDialog(account, "tweet");
      },
      onComposeDM: function()
      {
        Log.metric("global", "dm:compose");
        openTweetDialog(account, "dm");
      },
      onToggleFavorite: function(m)
      {
        Log.metric("tweet", m.favorited() ? "unfav" : "fav");
        if (m.favorited())
        {
          m.favorited(false);
          account.unfavorite(m.is_retweet() ? m.retweet() : m);
        }
        else
        {
          m.favorited(true);
          account.favorite(m.is_retweet() ? m.retweet() : m);
        }
      },
      onSendRetweet: function(tweet)
      {
        Log.metric("tweet", "retweet:compose");
        openTweetDialog(account, "retweet", tweet);
      },
      onSendReply: function(tweet)
      {
        Log.metric("tweet", "reply:compose");
        openTweetDialog(account, "reply", tweet);
      },
      onSendDM: function(tweet)
      {
        Log.metric("tweet", "dm:compose");
        openTweetDialog(account, "dm", tweet);
      },
      onMention: function(m, v, e)
      {
        Log.metric("tweet", "mention:open");
        var screenName = e.target.dataset.name.slice(1).toLowerCase();
        Co.Routine(this,
          function()
          {
            return lgrid.read("/twitter/profile/screenName=" + screenName);
          },
          function(p)
          {
            openProfileDialog(account, p());
          }
        );
      },
      onProfilePic: function(tweet)
      {
        Log.metric("tweet", "pic:open");
        Co.Routine(this,
          function()
          {
            if (tweet.is_retweet())
            {
              tweet = tweet.retweet();
            }
            return lgrid.read("/twitter/profile/id=" + tweet.user().id_str);
          },
          function(p)
          {
            openProfileDialog(account, p());
          }
        );
      },
      onOpenErrors: function()
      {
        Log.metric("account", "errors:open");
        new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: partials.error_dialog,
          partials: partials,
          model: models.account().errors,
          controller:
          {
            onRemoveError: function(m, v, e)
            {
              if (m.op !== "fetch")
              {
                account.errors.remove(m);
              }
            }
          }
        });
      },
      onOpenPreferences: function()
      {
      },
      onFilter: function(m, v, e)
      {
        Log.metric("global", "filter:type");
        filterInput = e.target;
        RootView.getViewByName("tweets").filterText(filterInput.value.toLowerCase());
      },
      onDropFilter: function(m, v, e)
      {
        Log.metric("global", "filter:drop");
        filterInput = e.target;
        var key = v.dropped().key;
        models.filter(key);
        filterInput.value = key;
        RootView.getViewByName("tweets").filterText(key);
      },
      onFilterClear: function()
      {
        Log.metric("global", "filter:clear");
        filterInput && (filterInput.value = "");
        models.filter("");
        RootView.getViewByName("tweets").filterText("");
      }
    }
  });

  selectList(models.current_list(), RootView.getViewByName("main"));

  document.addEventListener("click", function()
  {
    editList(null);
  });

  function editList(v)
  {
    if (editView)
    {
      account.tweetLists._save();
      models.current_list()._save();
      editView.property("editMode", false);
      editView = null;
    }
    if (v)
    {
      editView = v;
      editView.property("editMode", true);
    }
  }
  
  Co.Forever(this,
    function()
    {
      var rel = {};
      var times = document.querySelectorAll("[data-timestamp]");
      for (var i = times.length - 1; i >= 0; i--)
      {
        var time = times[i];
        var since = Tweet.tweetTime(time.dataset.timestamp, rel);
        time.innerText = since;
        if (!rel.relative)
        {
          delete time.dataset.timestamp;
        }
      }
      return Co.Sleep(20);
    }
  );
  
  Co.Routine(this,
    function()
    {
      return lgrid.read("/accounts");
    },
    function(info)
    {
      if (info())
      {
        account.open();
      }
      else
      {
        // Welcome
        new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: partials.welcome,
          partials: partials,
          model: {},
          clickToClose: false,
          controller:
          {
            onStart: function(m, v)
            {
              v.close();
              account.open();
            }
          }
        });
      }
    }
  );

  //navigator.splashscreen && navigator.splashscreen.hide();
}

function openTweetDialog(account, type, tweet)
{
  new TweetBox().open(account, type, tweet);
}

function openProfileDialog(account, profile)
{
  new ModalView(
  {
    node: document.getElementById("root-dialog"),
    template: partials.tweet_profile,
    partials: partials,
    model: profile,
    controller:
    {
      onFollow: function()
      {
        profile.followed_by(true);
        account.follow(profile);
      },
      onUnfollow: function()
      {
        profile.followed_by(false);
        account.unfollow(profile);
      }
    }
  });
}
