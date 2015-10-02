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
	var tpl = E2.views.assetBrowser.assetsFrame
	var username = E2.models.user.get('username');
	var myAssets = E2.app.fluxAssetStore
		.listByUser(username, categoryName)
	var systemAssets = E2.app.fluxAssetStore
		.listByUser('system', categoryName)

	var $target = $('#'+categoryName+'Tab')

	var groups = [
		{ groupTitle: 'Yours', assets: myAssets },
		{ groupTitle: 'System', assets: systemAssets },
	]

	var html = tpl({
		groups
	})

	$target.empty().append(html)
}

E2.AssetBrowserView = AssetBrowserView

})()
