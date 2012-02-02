
var host = "havelock.local.";
var storageRoot = Environment.isTouch() ? "http://" + host + ":8081" : location.origin;
var networkProxy = Environment.isTouch() ? null : "http://" + host + ":8081/api/twitter/";
var streamProxy = Environment.isTouch() ? null : "http://" + host + ":8081/userstream/twitter/";
var readabilityProxy = Environment.isTouch() ? null : "http://" + host + ":8081/readability/";

var partials;

var NewTweetModel = Model.create(
{
  _split: /(https?:\/\/\S*)/, // Need a better pattern

  text: Model.Property,
  replyId: Model.Property,
  screen_name: Model.Property,
  count: function()
  {
    var count = 140;
    this.text().split(this._split).forEach(function(txt, idx)
    {
      if (idx % 2 === 1)
      {
        if (txt.slice(0, 5) === "https")
        {
          count -= Math.min(txt.length, 21);
        }
        else
        {
          count -= Math.min(txt.length, 20);
        }
      }
      else
      {
        count -= txt.length;
      }
    });
    return count;
  }
});

var editView = null;

function main()
{
  var selectedListView = null;
  var scrollView = null;

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
  
  function onScrollView(evt)
  {
    switch (evt)
    {
      case "liveList.scroll.toTop":
        Log.metric("nav", "list.scrollToTop");
        break;
      case "liveList.scroll.insertAbove":
        Log.metric("nav", "list.insertAtTop");
        break;
      case "liveList.scroll.insertBelow":
        Log.metric("nav", "list.scrollDown");
        break;
    }
  }
  
  function selectList(m, v)
  {
    var sv = RootView.getViewByName("tweets");
    if (sv !== scrollView)
    {
      scrollView && scrollView.removeEventListener("liveList.scroll.toTop liveList.scroll.insertAbove liveList.scroll.insertBelow", onScrollView);
      scrollView = sv;
      scrollView && scrollView.on("liveList.scroll.toTop liveList.scroll.insertAbove liveList.scroll.insertBelow", onScrollView);
    }
    if (models.current_list() !== m)
    {
      Log.metric("nav", "list:select");
    }
    scrollView.scrollToTop(models.current_list() !== m);
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
        switch (m.type())
        {
          case "searches":
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
          default:
            break;
        }
      },
      onDropToList: function(m, v)
      {
        account.tweetLists.addIncludeTag(m, v.dropped());
      },
      onDropToNewList: function(m, v)
      {
        var listName = v.dropped().title;
        var list = account.tweetLists.createList(listName, listName[0] === "#" ? "searches" : "tweets");
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
        var readModel = new ReadabilityModel();
        var pagenr = 0;
        var maxpagenr = 0;
        var mv = new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: partials.readability,
          partials: partials,
          model: readModel,
          controller:
          {
            onForward: function()
            {
              var r = document.querySelector("#readability-scroller .text");
              pagenr = Math.min(maxpagenr - 1, pagenr + 1);
              r.style.WebkitTransform = "translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,0)";
            },
            onBackward: function()
            {
              var r = document.querySelector("#readability-scroller .text");
              pagenr = Math.max(0, pagenr - 1);
              r.style.WebkitTransform = "translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,0)";
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
            return Readability.read(readModel, e.target.dataset.href);
          },
          function()
          {
            Co.Yield();
          },
          function()
          {
            var r = document.querySelector("#readability-scroller .text");
            var gap = parseInt(getComputedStyle(r).WebkitColumnGap);
            maxpagenr = Math.ceil((r.scrollWidth + gap) / (r.offsetWidth + gap));
            mv.property("pages", Math.min(5, maxpagenr));
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
            account.unfavorite(m);
          }
          else
          {
            account.favorite(m);
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
  if (tweet && tweet.is_retweet())
  {
    tweet = tweet.retweet();
  }
  var text = type === "reply" ? "@" + tweet.screen_name() : type === "retweet" ? tweet.text() : "";
  var send = new NewTweetModel(
  {
    text: text,
    replyId: tweet && tweet.id(),
    screen_name: tweet && tweet.screen_name()
  });
  new ModalView(
  {
    node: document.getElementById("root-dialog"),
    template: partials.tweet_dialog,
    partials: partials,
    model: send,
    clickToClose: false,
    properties:
    {
      isEdit: type !== "retweet",
      isReply: type === "reply",
      isRetweet: type === "retweet",
      isTweet: type === "tweet",
      isDM: type === "dm"
    },
    controller:
    {
      onEdit: function(m, v)
      {
        v.update(
        {
          isRetweet: false,
          isTweet: true,
          isEdit: true,
          isDM: false
        });
        m.text('"@' + (tweet.is_retweet() ? tweet.retweet().screen_name() : tweet.screen_name()) + ': ' + m.text() + '"');
      },
      onTweetButton: function(m, v)
      {
        Log.metric("tweet", type === "retweet" ? "comment" : type);
        account.tweet(m);
        v.close();
      },
      onRetweetButton: function(m, v)
      {
        Log.metric("tweet", "retweet");
        account.retweet(tweet.id());
        v.close();
      },
      onReplyButton: function(m, v)
      {
        Log.metric("tweet", "reply");
        account.reply(m);
        v.close();
      },
      onDMButton: function(m, v)
      {
        Log.metric("tweet", "dm");
        account.dm(m);
        v.close();
      },
      onCancelButton: function(m, v)
      {
        v.close();
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
