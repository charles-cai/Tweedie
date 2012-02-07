
var host = "havelock.local.";
var storageRoot = Environment.isTouch() ? "http://" + host + ":8081" : location.origin;
var networkProxy = Environment.isTouch() ? null : "http://" + host + ":8081/api/twitter/";
var streamProxy = Environment.isTouch() ? null : "http://" + host + ":8081/userstream/twitter/";
var readabilityProxy = Environment.isTouch() ? null : "http://" + host + ":8081/readability/";
var imageProxy = Environment.isTouch() ? null : "http://" + host + ":8081/image/";

var partials;

var editView = null;

function main()
{
  var selectedListView = null;

  var account = new Account();

  models = new (Model.create(
  {
    current_list: Model.Property,
    lists: Model.Property,
    name: function()
    {
      return account.tweetLists.screenname;
    }
  }))(
  {
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
    RootView.getViewByName("tweets").scrollToTop(models.current_list() !== m);
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
  new RootView(
  {
    node: document.getElementById("root"),
    template: partials.main,
    partials: partials,
    model: models,
    controller:
    {
      onSelectList: function(m, v)
      {
        selectList(m, v);
        if (m.isSearch())
        {
          var query = "";
          m.includeTags().forEach(function(tag)
          {
            switch (tag.tag.type)
            {
              case "screenname":
              case "hashtag":
              case "hostname":
              case "search":
                query += tag.tag.key + " ";
                break;
              default:
                break;
            }
          });
          if (query)
          {
            account.search(query.slice(0, -1));
          }
        }
      },
      onDropToList: function(m, v)
      {
        account.tweetLists.addIncludeTag(m, v.dropped());
      },
      onDropToNewList: function(m, v)
      {
        var listName = v.dropped().title;
        if (listName[0] === "#")
        {
          listName += "?";
        }
        var list = account.tweetLists.createList(listName);
        if (list)
        {
          account.tweetLists.addIncludeTag(list, v.dropped());
        }
      },
      onNewList: function(m, v, e)
      {
        var listName = e.target.value;
        if (listName)
        {
          if (listName[listName.length - 1] === "?")
          {
            var list = account.tweetLists.createList(listName, "searches");
            account.tweetLists.addIncludeTag(list, { type: "search", title: listName, key: listName.toLocaleLowerCase().slice(0, -1) });
          }
          else
          {
            account.tweetLists.createList(listName, "tweets");
          }
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
        var readModel = new ReadabilityModel(
        {
          text: ""
        });
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
        Co.Routine(this,
          function()
          {
            return Readability.read(readModel, url);
          },
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
            for (var i = 0; i < images.length; i++)
            {
              images[i].onload = recalc;
            }
            recalc();
            mv.pagenr(0);
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
      onToggleFavorite: function(m)
      {
        if (!m.isDM())
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
        }
      },
      onSendRetweet: function(tweet)
      {
        openTweetDialog(account, tweet.isDM() ? "dm" : "retweet", tweet);
      },
      onSendReply: function(tweet)
      {
        openTweetDialog(account, tweet.isDM() ? "dm" : "reply", tweet);
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
            return account.profileById(tweet.user().id);
          },
          function(p)
          {
            p = p();
            new ModalView(
            {
              node: document.getElementById("root-dialog"),
              template: partials.tweet_profile,
              partials: partials,
              model: p,
              controller:
              {
                onFollow: function()
                {
                  p.followed_by(true);
                  account.follow(p);
                },
                onUnfollow: function()
                {
                  p.followed_by(false);
                  account.unfollow(p);
                }
              }
            });
          }
        );
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
