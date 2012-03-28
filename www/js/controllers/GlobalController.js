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
    var m = models.current_list();
    var last = m.tweets().models[0];
    m.lastRead(last && last.id());
    m.updateUnreadAndVelocity();
  }
});
