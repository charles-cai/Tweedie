var dbinfo =
{
  name: "storage",
  size: 5 * 1024 * 1024,
  table: "appstore"
};

var StorageGridProvider = Environment.isPhoneGap() ? xo.SQLStorageGridProvider : xo.LocalStorageGridProvider;

new StorageGridProvider(
  grid.get(),
  /^\/accounts$/,
  function()
  {
    return "accounts_accountInfo";
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/tweetlist\/(.*)\/(.*)$/,
  function(selector, path)
  {
    var p = selector.exec(path);
    return "accounts_tweets_" + p[1] + "_" + p[2];
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/topics$/,
  function(selector, path)
  {
    return "accounts_topics";
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/errors$/,
  function()
  {
    return "accounts_errors";
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/tweets\/(.*)$/,
  function(selector, path)
  {
    return "accounts_alltweets_" + selector.exec(path)[1];
  },
  dbinfo
);
