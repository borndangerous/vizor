var User = require('../models/user');
var when = require('when');

function AssetService(assetModel) {
	this._model = assetModel;
};

AssetService.prototype.list = function()
{
	return this.find();
};

AssetService.prototype.find = function(q)
{
	var dfd = when.defer();
	this._model
		.find(q)
		.sort('-updatedAt')
		.populate('_creator')
		.exec(function(err, list)
	{
		if (err)
			return dfd.reject(err);
		
		dfd.resolve(list);
	});

	return dfd.promise;
};

AssetService.prototype.findByCreatorName = function(username) {
	var that = this
	var dfd = when.defer()

	User.findOne({ username: username })
	.exec(function(err, user) {
		if (err)
			return dfd.reject(err)

		dfd.resolve(that.find({ '_creator': user._id }))
	})
	return dfd.promise
}

AssetService.prototype.findByCreatorId = function(userId) {
	return this.find({
		'_creator': userId
	})
}

AssetService.prototype.canWrite = function(user, path)
{
	return this.findByPath(path)
	.then(function(asset)
	{
		if (!asset)
			return true;

		var creator = asset._creator;

		if (creator._id)
			creator = creator._id;

		return !asset ||
			creator.toString() === user.id.toString();
	});
};

AssetService.prototype.findOne = function(q)
{
	var dfd = when.defer();
	this._model
		.findOne(q)
		.populate('_creator')
		.exec(function(err, item)
	{
		if (err)
			return dfd.reject(err);
		
		dfd.resolve(item);
	});

	return dfd.promise;
};

AssetService.prototype.findByPath = function(path)
{
	return this.findOne({path: path});
};

AssetService.prototype.save = function(data, user)
{
	var that = this;

	return this.findByPath(data.path)
	.then(function(asset)
	{
		if (!asset)
			asset = new that._model(data);

		asset._creator = user.id;
		asset.updatedAt = Date.now();

		var dfd = when.defer();

		asset.save(function(err)
		{
			if (err)
				return dfd.reject(err);

			dfd.resolve(asset);
		});

		return dfd.promise;
	});
};

module.exports = AssetService;

