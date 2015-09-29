(function(){

function AssetBrowserView($assetsLib) {
	this.$assetsLib = $assetsLib
}

AssetBrowserView.prototype.init = function() {
	var store = E2.app.fluxAssetStore
	store.on('changed', this.renderCategory.bind(this))
}

AssetBrowserView.prototype.renderCategory = 
function(categoryName) {
	var assets = E2.app.fluxAssetStore.list(categoryName)
	var tpl = E2.views.assetBrowser.assetsFrame
	var $target = $('#'+categoryName+'Tab')

	var html = tpl({
		categoryName: categoryName,
		groupTitle: 'Yours',
		assets: assets
	})

	$target.empty().append(html)
}

E2.AssetBrowserView = AssetBrowserView

})()
