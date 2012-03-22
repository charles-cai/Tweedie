(function()
{
  var Profile = Model.create(
  {
    id: Model.Property("id_str"),
    screen_name: Model.Property,
    name: Model.Property,
    description: Model.Property,
    location: Model.Property,
    url: Model.Property,
    verified: Model.Property,

    profile_background_tile: Model.Property,
    profile_image_url: function()
    {
      if (!this._profile_image_url)
      {
        this._profile_image_url = "http://api.twitter.com/1/users/profile_image/" + this.screen_name() + Tweet.profileImgExt;
      }
      return this._profile_image_url;
    },
    profile_background_image_url: Model.Property,
    profile_background_color: Model.Property,
    profile_banner_url: Model.Property,

    followers_count: Model.Property,
    friends_count: Model.Property,
    tweet_count: Model.Property("statuses_count"),
    followed_by: Model.Property("relationship.target.followed_by"),

    constructor: function(__super, screenName)
    {
      __super(
      {
        id_str: 0,
        screen_name: screenName,
        name: "",
        description: "",
        location: "",
        url: "",
        verified: false,
        followers_count: "",
        friends_count: "",
        statuses_count: "",
        relationship:
        {
          target:
          {
            followed_by: false
          }
        }
      });
    }
  });

  var lgrid = grid.get();
  var nameSelector = /^\/twitter\/profile\/screenName=(.*)$/;

  function getProfile(name)
  {
    var p = new Profile(name);
    if (name)
    {
      lgrid.write("/twitter/profile/screenName=" + name.toLowerCase(), p);
    }
    Co.Routine(this,
      function()
      {
        return Co.Parallel(this,
          function()
          {
            return PrimaryFetcher.profile(name);
          },
          function()
          {
            return PrimaryFetcher.relationship(name);
          }
        );
      },
      function(info)
      {
        info = info();
        info[0].relationship = info[1].relationship;
        info = info[0];
        p.delayUpdate(function()
        {
          [ "screen_name", "name", "description", "location", "url", "verified", "profile_background_tile", "profile_background_image_url", "profile_background_color", "profile_banner_url", "followers_count", "friends_count" ].forEach(function(name)
          {
            p[name](info[name]);
          });
          p.id(info.id_str);
          p.tweet_count(info.statuses_count)
          p.followed_by(info.relationship.target.followed_by);
        });
        lgrid.write("/twitter/profile/screenName=" + p.screen_name().toLowerCase(), p);
      }
    );
  }

  lgrid.watch(nameSelector, function(op, path)
  {
    if (op === xo.Grid.READ)
    {
      getProfile(nameSelector.exec(path)[1]);
    }
  });
})();
