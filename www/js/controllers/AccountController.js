var AccountController = xo.Controller.create(
{
  metrics:
  {
    category: "account"
  },

  onToggleShow: function(_, _, _, _, root)
  {
    this.metric(root.open() ? "hide" : "show");
    root.open(!root.open());
  },

  onOpenErrors: function(_, _, _, models)
  {
    this.metric("errors:open");
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