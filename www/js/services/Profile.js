(function()
{
  var Profile = Model.create(
  {
    id: Model.ROProperty("id_str"),
    screen_name: Model.ROProperty,
    name: Model.ROProperty,
    description: Model.ROProperty,
    location: Model.ROProperty,
    url: Model.ROProperty,
    verified: Model.ROProperty,

    profile_background_tile: Model.ROProperty,
    profile_image_url: Model.ROProperty,
    profile_background_image_url: Model.ROProperty,
    profile_background_color: Model.ROProperty,
    profile_banner_url: Model.ROProperty,

    followers_count: Model.ROProperty,
    friends_count: Model.ROProperty,
    tweet_count: Model.ROProperty("statuses_count"),
    followed_by: Model.Property("relationship.target.followed_by")
  });

  var lgrid = grid.get();
  var idSelector = /^\/twitter\/profile\/id=(.*)$/;
  var nameSelector = /^\/twitter\/profile\/screenName=(.*)$/;

  function getProfile(name, id)
  {
    Co.Routine(this,
      function()
      {
        return Co.Parallel(this,
          function()
          {
            return PrimaryFetcher.profile(name, id);
          },
          function()
          {
            return PrimaryFetcher.relationship(name, id);
          }
        );
      },
      function(p)
      {
        p = p();
        p[0].relationship = p[1].relationship;
        p = new Profile(p[0]);

        lgrid.write("/twitter/profile/id=" + p.id(), p);
        lgrid.write("/twitter/profile/screenName=" + p.screen_name().toLowerCase(), p);
      }
    );
  }

  lgrid.watch(idSelector, function(op, path)
  {
    if (op === xo.Grid.READ)
    {
      getProfile(null, idSelector.exec(path)[1]);
    }
  });
  lgrid.watch(nameSelector, function(op, path)
  {
    if (op === xo.Grid.READ)
    {
      getProfile(nameSelector.exec(path)[1], null);
    }
  });
})();
