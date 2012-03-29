var GlobalController = xo.Controller.create(
{
  metrics:
  {
    category: "global"
  },

  onComposeTweet: function(_, _, _, models)
  {
    this.metric("tweet:compose");
    new TweetBox().open(models.account(), "tweet");
  },

  onComposeDM: function(_, _, _, models)
  {
    this.metric("dm:compose");
    new TweetBox().open(models.account(), "dm");
  },

  onInsertAtTop: function(_, _, _, models)
  {
    models.current_list().markAllAsRead();
  }
});
