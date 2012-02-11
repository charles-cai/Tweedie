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

var ProfileManager = Class(
{
  constructor: function(account)
  {
    this._account = account;
    this._profiles = new xo.LRU(10);
  },

  profileByUser: function(user)
  {
    return this._profiles.get(user.id_str) || this._getProfile(null, user.id_str);
  },

  profileByName: function(name)
  {
    return this._profiles.get(name) || this._getProfile(name, null);
  },

  _getProfile: function(name, id)
  {
    return Co.Routine(this,
      function()
      {
        return Co.Parallel(this,
          function()
          {
            return this._account._fetcher.profile(name, id);
          },
          function()
          {
            return this._account._fetcher.relationship(name, id);
          }
        );
      },
      function(p)
      {
        p = p();
        p[0].relationship = p[1].relationship;
        p = new Profile(p[0]);
        this._profiles.add(p.id(), p);
        this._profiles.add(p.screen_name(), p);
        return p;
      }
    );
  }
});

