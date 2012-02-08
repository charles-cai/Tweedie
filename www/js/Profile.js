var Profile = Model.create(
{
  id: Model.ReadOnlyProperty("id_str"),
  screen_name: Model.ReadOnlyProperty,
  name: Model.ReadOnlyProperty,
  description: Model.ReadOnlyProperty,
  location: Model.ReadOnlyProperty,
  url: Model.ReadOnlyProperty,
  verified: Model.ReadOnlyProperty,

  profile_background_tile: Model.ReadOnlyProperty,
  profile_image_url: Model.ReadOnlyProperty,
  profile_background_image_url: Model.ReadOnlyProperty,
  profile_background_color: Model.ReadOnlyProperty,

  followers_count: Model.ReadOnlyProperty,
  friends_count: Model.ReadOnlyProperty,
  tweet_count: Model.ReadOnlyProperty("statuses_count"),
  followed_by: Model.Property("relationship.target.followed_by")
});

var ProfileManager = Class(
{
  constructor: function(account)
  {
    this._account = account;
    this._profiles = {};
  },

  profileByUser: function(user)
  {
    return this._profiles[user.id_str] || this._getProfile(null, user.id_str);
  },

  profileByName: function(name)
  {
    return this._profiles[name] || this._getProfile(name, null);
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
        this._profiles[p.id()] = p;
        this._profiles[p.screen_name()] = p;
        return p;
      }
    );
  }
});

