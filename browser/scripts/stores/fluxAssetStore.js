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
	var username = E2.models.user.get('username')
	that.collections[username] = {};

	['scene', 'image', 'audio', 'video']
	.map(function(modelName) {
		that.models[modelName] = Backbone.Model.extend({
			idAttribute: '_id'
		})

		that.getAssetsByUsernameAndModel(username, modelName)
		that.getAssetsByUsernameAndModel('system', modelName)
	})
}

FluxAssetStore.prototype.listByUser = function(userName, modelName) {
	return this.collections[userName][modelName].toJSON()
}

FluxAssetStore.prototype.get =
function(modelName, id) {
	return this.collections[modelName].get(id)
}

FluxAssetStore.prototype.getAssetsByUsernameAndModel =
function(username, modelName) {
	var that = this
	var dfd = when.defer()

	var Collection = Backbone.Collection.extend({
		model: that.models[modelName]
	})

	if (!that.collections[username])
		that.collections[username] = {}

	that.collections[username][modelName] = new Collection()

	if (username) {
		$.get('/'+username+'/assets/'+modelName+'.json', function(list) {
			list = list.map(function(item) {
				item.name = basename(item.path)
				return item
			})

			that.collections[username][modelName].set(list)

			that.emit('changed', modelName, list)
		})
	} else {
		dfd.resolve([])
	}
	return dfd.promise
}

E2.FluxAssetStore = FluxAssetStore

})()
