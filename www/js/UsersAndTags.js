var UsersAndTags = Class(
{
  constructor: function(account)
  {
    this._account = account;
    this._usersLRU = new xo.LRU(1000);
    this._tagsLRU = new xo.LRU(1000);
  },

  addUser: function(screenname, name)
  {
    var val =
    {
      key: screenname.toLowerCase(),
      name: name,
      screenname: screenname,
      image: "http://api.twitter.com/1/users/profile_image/" + screenname + ".png?size=mini"
    };
    this._usersLRU.add(name.toLowerCase(), val);
    this._usersLRU.add(val.key, val);
  },

  suggestUser: function(partialName)
  {
    var seen = {};
    var matches = [];
    this._usersLRU.keys().forEach(function(key)
    {
      if (key.indexOf(partialName) === 0)
      {
        var val = this._usersLRU.get(key);
        if (!seen[val.key])
        {
          seen[val.key] = true;
          matches.push(val);
        }
      }
    }, this);
    return matches;
  },

  addHashtag: function(tag)
  {
    this._tagsLRU.add(tag.toLowerCase(), { name: tag });
  },

  suggestHashtag: function(partialTag)
  {
    var matches = [];
    this._tagsLRU.keys().forEach(function(key)
    {
      if (key.indexOf(partialTag) === 0)
      {
        matches.push(this._tagsLRU.get(key));
      }
    }, this);
    return matches;
  }
});
