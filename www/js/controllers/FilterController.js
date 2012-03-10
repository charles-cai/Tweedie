var FilterController = xo.Controller.create(
{
  onFilter: function(_, _, e)
  {
    Log.metric("global", "filter:type");
    this._filterInput = e.target;
    RootView.getViewByName("tweets").filterText(this._filterInput.value.toLowerCase());
  },
  onDropFilter: function(_, v, e, models)
  {
    Log.metric("global", "filter:drop");
    this._filterInput = e.target;
    var key = v.dropped().key;
    models.filter(key);
    this._filterInput.value = key;
    RootView.getViewByName("tweets").filterText(key);
  },
  onFilterClear: function(_, _, _, models)
  {
    Log.metric("global", "filter:clear");
    this._filterInput && (this._filterInput.value = "");
    models.filter("");
    RootView.getViewByName("tweets").filterText("");
  }
});
