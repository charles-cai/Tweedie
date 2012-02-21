var dbinfo =
{
  name: "storage",
  size: 10 * 1024 * 1024,
  table: "appstore"
};

new xo.LocalStorageGridProvider(
  grid.get(),
  /^\/accounts$/,
  function()
  {
    return "accounts_accountInfo";
  },
  dbinfo
);
new xo.LocalStorageGridProvider(
  grid.get(),
  /^\/tweetlist\/(.*)\/(.*)$/,
  function(selector, path)
  {
    var p = selector.exec(path);
    return "accounts__tweets_" + p[1] + "_" + p[2];
  },
  dbinfo
);
new xo.LocalStorageGridProvider(
  grid.get(),
  /^\/topics\/(.*)$/,
  function(selector, path)
  {
    return "accounts__topics_" + selector.exec(path)[1];
  },
  dbinfo
);
new xo.LocalStorageGridProvider(
  grid.get(),
  /^\/errors$/,
  function()
  {
    return "accounts__errors_errors";
  },
  dbinfo
);
new xo.LocalStorageGridProvider(
  grid.get(),
  /^\/tweets\/(.*)$/,
  function(selector, path)
  {
    return "accounts__alltweets_" + selector.exec(path)[1];
  },
  dbinfo
);
