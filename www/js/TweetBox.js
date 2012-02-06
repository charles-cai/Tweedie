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

var TweetBox = Class(
{
  open: function(account, type, tweet)
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
    var mv = new ModalView(
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
            isEdit: true
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
    if (type === "reply")
    {
      send.on("update.text", function fn()
      {
        if (send.text()[0] !== "@")
        {
          send.removeEventListener("update.text", fn);
          mv.update(
          {
            isReply: false,
            isTweet: true
          });
        }
      });
    }
  }
});
