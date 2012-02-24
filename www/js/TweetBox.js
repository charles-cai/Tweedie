var NewTweetModel = Model.create(
{
  _split: /(https?:\/\/\S*)/, // Need a better pattern

  text: Model.Property,
  replyId: Model.Property,
  screen_name: Model.Property,
  target: Model.Property,
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
    var text = type === "reply" ? tweet.at_screen_name() : type === "retweet" ? tweet.text() : "";
    var send = new NewTweetModel(
    {
      text: text,
      replyId: tweet && tweet.id(),
      screen_name: tweet && tweet.conversation(),
      target: tweet && tweet.conversation()
    });
    var target = null;
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
          m.text('RT @' + (tweet.is_retweet() ? tweet.retweet().screen_name() : tweet.screen_name()) + ': ' + m.text());
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
          account.retweet(tweet);
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
        },
        onInput: function(m, v, e)
        {
          var value = e.target.value;
          var curpos = e.target.selectionStart;
          var start;
          wordStart: for (start = curpos - 1; start > 0; start--)
          {
            switch (value[start])
            {
              case " ":
              case "\n":
                start++;
                break wordStart;
              default:
                break;
            }
          }
          var len = value.length;
          var end;
          wordEnd: for (end = start; end < len; end++)
          {
            switch (value[end])
            {
              case " ":
              case "\n":
                break wordEnd;
              default:
                break;
            }
          }
          if (end > start + 1)
          {
            var word = value.slice(start + 1, end).toLowerCase();
            switch (value[start])
            {
              case "@":
                mv.property("usuggestions", account.userAndTags.suggestUser(word).slice(0, 10));
                target =
                {
                  textarea: e.target,
                  start: start,
                  end: end,
                  type: "@"
                };
                break;
              case "#":
                mv.property("hsuggestions", account.userAndTags.suggestHashtag(word).slice(0, 10));
                target =
                {
                  textarea: e.target,
                  start: start,
                  end: end,
                  type: "#"
                };
                break;
              default:
                mv.property("usuggestions", null);
                mv.property("hsuggestions", null);
                target = null;
                break;
            }
          }
          else
          {
            mv.property("usuggestions", null);
            mv.property("hsuggestions", null);
            target = null;
          }

          m[e.target.name](e.target.value);
        },
        onSuggestion: function(m)
        {
          if (target)
          {
            var value = target.textarea.value;
            var name = m.screenname || m.name;
            value = value.slice(0, target.start) + target.type + name + (value.slice(target.end) || " ");
            target.textarea.value = value;
            send.text(value);
            var cur = target.start + name.length + 2;
            target.textarea.selectionStart = cur;
            target.textarea.selectionEnd = cur;
            mv.property("usuggestions", null);
            mv.property("hsuggestions", null);
            target = null;
          }
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
