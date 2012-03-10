var GlobalController = xo.Controller.create(
{
  onToggleShow: function(_, _, _, _, root)
  {
    Log.metric("lists", root.open() ? "close" : "open");
    root.open(!root.open());
  },

  onComposeTweet: function(_, _, _, models)
  {
    Log.metric("global", "tweet:compose");
    new TweetBox().open(models.account(), "tweet");
  },

  onComposeDM: function(_, _, _, models)
  {
    Log.metric("global", "dm:compose");
    new TweetBox().open(models.account(), "dm");
  },

  onOpenErrors: function(_, _, _, models)
  {
    Log.metric("account", "errors:open");
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.error_dialog,
      partials: __resources,
      model: models.account().errors,
      controller:
      {
        onRemoveError: function(m)
        {
          if (m.op !== "fetch")
          {
            models.account().errors.remove(m);
          }
        }
      }
    });
  },
});
