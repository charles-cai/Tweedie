var Profile = Model.create(
{
  id: Model.ReadOnlyProperty("id_str"),
  screen_name: Model.ReadOnlyProperty,
  name: Model.ReadOnlyProperty,
  description: Model.ReadOnlyProperty,
  url: Model.ReadOnlyProperty,
  verified: Model.ReadOnlyProperty,

  profile_background_tile: Model.ReadOnlyProperty,
  profile_image_url: Model.ReadOnlyProperty,
  profile_background_image_url: Model.ReadOnlyProperty,

  followers_count: Model.ReadOnlyProperty,
  friends_count: Model.ReadOnlyProperty,
  tweet_count: Model.ReadOnlyProperty("statuses_count"),

  followed_by: function(v)
  {
    var ov = this._values.relationship.target.followed_by;
    if (arguments.length && v !== ov)
    {
      this._values.relationship.target.followed_by = v;
      this.emit("update");
    }
    return ov;
  }
});

var ProfileManager = Class(
{
  constructor: function(account)
  {
    this._account = account;
    this._profiles = {};
  },

  profileById: function(id)
  {
    return Co.Routine(this,
      function()
      {
        var p = this._profiles[id];
        if (p)
        {
          return Co.Break(p);
        }
        return Co.Parallel(this,
          function()
          {
            return this._account._fetcher.profileById(id);
          },
          function()
          {
            return this._account._fetcher.relationshipBy(id);
          }
        );
      },
      function(p)
      {
        p = p();
        p[0].relationship = p[1].relationship;
        p = new Profile(p[0]);
        this._profiles[id] = p;
        return p;
      }
    );
  }
});

