(function() {

function basename(path) {
	return path.split('/').slice(-1)
		.join().split('.')[0]
}

function FluxAssetStore() {
	EventEmitter.call(this)
	this.models = {}
	this.collections = {}
}

FluxAssetStore.prototype = Object.create(EventEmitter.prototype)

FluxAssetStore.prototype.init =
function init() {
	var that = this
	var username = E2.models.user.get('username');

	['scene', 'image', 'audio', 'video']
	.map(function(modelName) {
		that.models[modelName] = Backbone.Model.extend({
			idAttribute: '_id'
		})

		var c = Backbone.Collection.extend({
			model: that.models[modelName]
		})

		that.collections[modelName] = new c()

		that.getAssetsByUsernameAndModel(username, modelName)
		.then(function(list) {
			list = list.map(function(item) {
				item.name = basename(item.path)
				return item
			})

			that.collections[modelName].set(list)

			that.emit('changed', modelName, list)
		})
	})
}

FluxAssetStore.prototype.list = function(modelName) {
	return this.collections[modelName].toJSON()
}

FluxAssetStore.prototype.get =
function(modelName, id) {
	return this.collections[modelName].get(id)
}

FluxAssetStore.prototype.getAssetsByUsernameAndModel =
function(username, model) {
	var dfd = when.defer()
	if (username) {
		$.get('/'+username+'/assets/'+model+'.json', function(list) {
			dfd.resolve(list)
		})
	} else {
		dfd.resolve([])
	}
	return dfd.promise
}

E2.FluxAssetStore = FluxAssetStore

})()
