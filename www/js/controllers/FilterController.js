var FilterController = xo.Controller.create(
{
  metrics:
  {
    category: "filter"
  },
  onFilter: function(_, _, e)
  {
    this.metric("type");
    this._filterInput = e.target;
    RootView.getViewByName("tweets").filterText(this._filterInput.value.toLowerCase());
  },
  onDropFilter: function(_, v, e, models)
  {
    this.metric("drop");
    this._filterInput = e.target;
    var key = v.dropped().key;
    models.filter(key);
    this._filterInput.value = key;
    RootView.getViewByName("tweets").filterText(key);
  },
  onFilterClear: function(_, _, _, models)
  {
    this.metric("clear");
    this._filterInput && (this._filterInput.value = "");
    models.filter("");
    RootView.getViewByName("tweets").filterText("");
    models.current_list().markAllAsRead();
  }
});
