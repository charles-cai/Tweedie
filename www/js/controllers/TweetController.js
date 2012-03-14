var TweetController = xo.Controller.create(
{
  constructor: function(__super)
  {
    __super();
    this.lgrid = grid.get();
  },

  metrics:
  {
    category: "tweet"
  },

  onUrl: function(m, v, e)
  {
    this.metric("url:open");
    var url = e.target.dataset.href;

    Co.Routine(this,
      function()
      {
        return this.lgrid.read("/readable=" + url);
      },
      function(readModel)
      {
        readModel = readModel();

        var pagenr = 0;
        var maxpagenr = 0;
        var mv = new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: __resources.readability,
          partials: __resources,
          model: readModel,
          properties:
          {
            pages: 0,
            pagenr: 0,
            translate: ""
          },
          controller: new (xo.Controller.create(
          {
            metrics:
            {
              category: "readability"
            },
            onForward: function()
            {
              Co.Routine(this,
                function()
                {
                  var r = document.querySelector("#readability-scroller .text");
                  pagenr = Math.min(maxpagenr - 1, pagenr + 1);
                  mv.translate("-webkit-transform: translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,1px)");
                  Co.Sleep(0.2);
                },
                function()
                {
                  mv.pagenr(pagenr);
                  this.metric("page:forward", pagenr);
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
                  Co.Sleep(0.2);
                },
                function()
                {
                  mv.pagenr(pagenr);
                  this.metric("page:backward", pagenr);
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
              this.metric("browser:open");
            },
            onClose: function()
            {
              this.metric("close");
              mv.close();
            }
          }))
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
                var img = images[i];
                img.onload = recalc;
                img.onerror = hide;
                if (img.complete && img.naturalHeight === 0 && img.naturalWidth === 0)
                {
                  img.onerror();
                }
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

  onImage: function(m, _, e, models)
  {
    this.metric("image:open");

    var url = e.target.dataset.href;
    var furl = e.target.dataset.fullHref || url;

    if (furl.indexOf("http://www.youtube.com/watch") === 0 || furl.indexOf("http://youtube.com/watch") === 0)
    {
      // Open Safari
      location = furl;
      return;
    }
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.imageview,
      partials: __resources,
      model:
      {
        url: url,
        tweet: models.current_list().viz() === "media" ? m : null,
        account: function()
        {
          return models.account();
        }
      },
      controller: this
    });
  },

  onVideo: function(_, _, e)
  {
    this.metric("video:open");
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.videoview,
      partials: __resources,
      model:
      {
        embed: unescape(e.target.dataset.embed)
      }
    });
  },

  onToggleFavorite: function(m, _, _, models)
  {
    this.metric(m.favorited() ? "unfav" : "fav");
    if (m.favorited())
    {
      m.favorited(false);
      models.account().unfavorite(m.is_retweet() ? m.retweet() : m);
    }
    else
    {
      m.favorited(true);
      models.account().favorite(m.is_retweet() ? m.retweet() : m);
    }
  },

  onSendRetweet: function(tweet, _, _, models)
  {
    this.metric("retweet:compose");
    new TweetBox().open(models.account(), "retweet", tweet);
  },

  onSendReply: function(tweet, _, _, models)
  {
    this.metric("reply:compose");
    new TweetBox().open(models.account(), "reply", tweet);
  },

  onSendDM: function(tweet, _, _, models)
  {
    this.metric("dm:compose");
    new TweetBox().open(models.account(), "dm", tweet);
  },

  onMention: function(_, _, e, models)
  {
    this.metric("mention:open");
    var screenName = e.target.dataset.name.slice(1).toLowerCase();
    Co.Routine(this,
      function()
      {
        return this.lgrid.read("/twitter/profile/screenName=" + screenName);
      },
      function(p)
      {
        this._openProfileDialog(p(), models);
      }
    );
  },

  onProfilePic: function(tweet, _, _, models)
  {
    this.metric("profile_pic:open");
    Co.Routine(this,
      function()
      {
        if (tweet.is_retweet())
        {
          tweet = tweet.retweet();
        }
        return this.lgrid.read("/twitter/profile/id=" + tweet.user().id_str);
      },
      function(p)
      {
        this._openProfileDialog(p(), models);
      }
    );
  },

  onOpenTweet: function(_, v, e)
  {
    var nested = v.node().querySelector(".nested-tweets");
    var open = v.property("tweet_open");
    if (open)
    {
      this.metric("nested:open");
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
      this.metric("nested:close");
      Co.Routine(this,
        function()
        {
          nested.style.height = 0;
          v.tweet_open(true);
          Co.Yield();
        },
        function()
        {
          nested.style.height = (20 + nested.scrollHeight) + "px";
        }
      );
    }
  },

  _openProfileDialog: function(profile, models)
  {
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.tweet_profile,
      partials: __resources,
      model: profile,
      controller: new (xo.Controller.create(
      {
        metrics:
        {
          category: "profile_dialog"
        },
        onFollow: function()
        {
          this.metric("follow");
          profile.followed_by(true);
          models.account().follow(profile);
        },
        onUnfollow: function()
        {
          this.metric("unfollow");
          profile.followed_by(false);
          models.account().unfollow(profile);
        }
      }))
    });
  }
});
