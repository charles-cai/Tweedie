
var networkProxy = Environment.isTouch() ? null : location.origin + "/api/twitter/";
var streamProxy = Environment.isTouch() ? null : location.origin + "/userstream/twitter/";
var readabilityProxy = Environment.isTouch() ? null : location.origin + "/readability/";
var imageProxy = Environment.isTouch() ? null : location.origin + "/image/";

var partials;

var editView = null;

function main()
{
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
    }
  }))(
  {
    account: account,
    current_list: account.tweetLists.lists.models[0],
    lists: account.tweetLists.lists
  });

  account.on("screenNameChange", function()
  {
    models.emit("update");
  });
  
  function selectList(m, v)
  {
    if (models.current_list() !== m)
    {
      Log.metric("nav", "list:select");
    }
    else
    {
      RootView.getViewByName("tweets").scrollToTop();
    }
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

  partials = findTemplates();
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
        root.open(!root.open());
      },
      onSelectList: function(m, v)
      {
        selectList(m, v);
        var query = m.asSearch();
        if (query)
        {
          account.search(query);
        }
      },
      onDropToList: function(m, v)
      {
        account.tweetLists.addIncludeTag(m, v.dropped());
      },
      onDropToNewList: function(m, v)
      {
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
        var listName = e.target.value;
        if (listName)
        {
          account.tweetLists.createList(listName);
        }
        e.target.value = "";
      },
      onEditList: function(m, v)
      {
        if (models.current_list().canEdit())
        {
          Log.metric("nav", "list:edit");
          editList(v);
        }
      },
      onRemoveList: function(m, v, e)
      {
        Log.metric("nav", "list:remove");
        account.tweetLists.removeList(models.current_list());
        editList(null);
        models.current_list(account.tweetLists.lists.models[0]);
        selectedListView = RootView.getViewByName("main");
        selectedListView.property("selected", true);
      },
      onDropInclude: function(m, v)
      {
        Log.metric("nav", "add:include");
        account.tweetLists.addIncludeTag(models.current_list(), v.dropped());
      },
      onDropExclude: function(m, v)
      {
        Log.metric("nav", "add:exclude");
        account.tweetLists.addExcludeTag(models.current_list(), v.dropped());
      },
      onKillInclude: function(m)
      {
        if (editView && editView.property("editMode"))
        {
          Log.metric("nav", "remove:include");
          account.tweetLists.removeIncludeTag(models.current_list(), m);
        }
      },
      onKillExclude: function(m)
      {
        if (editView && editView.property("editMode"))
        {
          Log.metric("nav", "remove:exclude");
          account.tweetLists.removeExcludeTag(models.current_list(), m);
        }
      },
      onChangeTweetSource: function(m, v, e)
      {
        Log.metric("nav", "changeSource");
        account.tweetLists.changeType(models.current_list(), e.target.value);
      },
      onChangeViz: function(m, v, e)
      {
        Log.metric("nav", "changeViz");
        account.tweetLists.changeViz(models.current_list(), e.target.value);
      },
      onOpenTweet: function(m, v, e)
      {
        var nested = v.node().querySelector(".nested-tweets");
        var open = v.property("open");
        if (open)
        {
          Co.Routine(this,
            function()
            {
              nested.style.height = 0;
              Co.Sleep(0.5);
            },
            function()
            {
              v.open(false);
            }
          );
        }
        else
        {
          Co.Routine(this,
            function()
            {
              nested.style.height = 0;
              v.open(true);
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
        Log.metric("details", "url");
        var url = e.target.dataset.href;
        //var readModel = Readability.open(url);
        
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
                translate: "",
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
                      mv.translate("-webkit-transform: translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,0)");
                      Co.Sleep(0.2);
                    },
                    function()
                    {
                      mv.pagenr(pagenr);
                      Log.metric("details", "url:page:forward", pagenr);
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
                      mv.translate("-webkit-transform: translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,0)");
                      Co.Sleep(0.2);
                    },
                    function()
                    {
                      mv.pagenr(pagenr);
                      Log.metric("details", "url:page:backward", pagenr);
                    }
                  );
                },
                onOpenWeb: function()
                {
                  var browser = ChildBrowser.install();
                  browser.onClose = function()
                  {
                    Readability.close();
                    mv.close();
                  };
                  browser.showWebPage(url);
                  Log.metric("details", "url:inBrowser");
                },
                onClose: function()
                {
                  Readability.close();
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
                    this.style.display = "none";
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
          }
        );
      },
      onMedia: function(m, v, e)
      {
        Log.metric("details", "image");
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
        Log.metric("details", "video");
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
        openTweetDialog(account, "tweet");
      },
      onComposeDM: function()
      {
        openTweetDialog(account, "dm");
      },
      onToggleFavorite: function(m)
      {
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
        openTweetDialog(account, "retweet", tweet);
      },
      onSendReply: function(tweet)
      {
        openTweetDialog(account, "reply", tweet);
      },
      onSendDM: function(tweet)
      {
        openTweetDialog(account, "dm", tweet);
      },
      onMention: function(m, v, e)
      {
        var screenName = e.target.dataset.name.slice(1);
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
        Log.metric("details", "image");
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
      }
    }
  });

  selectList(models.current_list(), RootView.getViewByName("main"));

  account.open();

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

function findTemplates()
{
  var partials = {};
  var templates = document.querySelectorAll(".template");
  for (var i = templates.length - 1; i >= 0; i--)
  {
    var template = templates[i];
    partials[template.id] = template.innerHTML.replace(/\n|\&gt;/g, function(s)
    {
      switch(s)
      {
        case "\n": return "";
        case "&gt;": return ">";
        default: return s;
      }
    });
  }
  return partials;
}
