(function() {
	var ThreeGazeClicker = E2.plugins.three_gaze_clicker = function(core) {
		this.desc = 'Gaze Clicker'
		Plugin.apply(this, arguments)

		this.core = core

		this.input_slots = [
			{name: 'camera', dt: core.datatypes.CAMERA},
			{name: 'scene', dt: core.datatypes.SCENE}
		]

		this.output_slots = [
			{name: 'scene', dt: core.datatypes.SCENE},
		]

		this.always_update = true
	}

	ThreeGazeClicker.prototype = Object.create(Plugin.prototype)

	ThreeGazeClicker.prototype.reset = function() {
		this.clickFactor = 0
	}

	ThreeGazeClicker.prototype.update_input = function(slot, data) {
		// no inputs

		switch (slot.index) {
		case 0: // camera
			this.camera = data
			break
		case 1: // scene
			this.scene = data
			break
		default:
			break
		}
	}

	ThreeGazeClicker.prototype.update_output = function() {
		return this.scene
	}

	ThreeGazeClicker.prototype.state_changed = function(ui) {
		if (!ui) {

		}
	}

	// geometry ---
	ThreeGazeClicker.prototype.GeometryGenerator = function() {
		this.type = 'Gaze Aim'

		this.segments = 12
		this.radialMarkers = [0, 0.3, 0.8, 1.0]

		that = this

		var i, j

		this.initialise = function() {
			THREE.Geometry.call(that)

			that.dynamic = true

			for (j = 0; j < that.segments + 1; j++) {
				for (i = 0; i < that.radialMarkers.length; i++) {
					that.vertices.push(new THREE.Vector3())
				}
			}

			var normal = new THREE.Vector3(0,0,1)

			for (j = 0; j < that.segments; j++) {
				for (i = 0; i < that.radialMarkers.length; i+=2) {
					var faceidxa = (j) * that.radialMarkers.length + i
					var faceidxb = (j) * that.radialMarkers.length + i + 1
					var faceidxc = (j + 1) * that.radialMarkers.length + i
					var faceidxd = (j + 1) * that.radialMarkers.length + i + 1

					that.faces.push(new THREE.Face3(faceidxa, faceidxb, faceidxc, normal))
					that.faces.push(new THREE.Face3(faceidxb, faceidxd, faceidxc, normal))

					that.faces.push(new THREE.Face3(faceidxa, faceidxc, faceidxb, normal))
					that.faces.push(new THREE.Face3(faceidxb, faceidxc, faceidxd, normal))
				}
			}
		}

		this.initialise()

		this.update = function(maxangle) {
			var idx = 0

			for (j = 0; j < that.segments + 1; j++) {
				for (i = 0; i < that.radialMarkers.length; i++) {
					var angle = j / that.segments

					// clamp outer ring
					if (i > 1) {
						angle = Math.min(angle, maxangle)
					}

					angle *= 3.14159 * 2

					var x = Math.sin(angle)
					var y = Math.cos(angle)

					var f = that.radialMarkers[i]

					that.vertices[idx].set(x * f, y * f, -1.0)

					idx++
				}
			}

			that.verticesNeedUpdate = true
		}
	}

	ThreeGazeClicker.prototype.GeometryGenerator.prototype = Object.create(THREE.Geometry.prototype)
	ThreeGazeClicker.prototype.GeometryGenerator.prototype.constructor = ThreeGazeClicker.prototype.GeometryGenerator

	// --- geometry

	ThreeGazeClicker.prototype.get_mesh = function() {
		if (!this.object3d) {
			this.geometry = new this.GeometryGenerator()
			this.material = new THREE.MeshBasicMaterial()
			this.object3d = new THREE.Mesh(this.geometry, this.material)
		}

		return this.object3d
	}

	ThreeGazeClicker.prototype.update_click = function() {
		if (!this.raycaster) {
			this.raycaster = new THREE.Raycaster()
		}

		this.raycaster.setFromCamera(new THREE.Vector3(0, 0, 0), this.camera)
		var intersects = this.raycaster.intersectObjects(this.scene.children[0].children)

		var hadObj = false

		if (intersects.length > 0) {
			if (intersects[0].object.onClick) {
				var curObj = intersects[0].object

				if (curObj != this.lastObj) {
					this.objTimer = this.core.abs_t
					this.lastObj = curObj
				}

				hadObj = true
			}
		}

		if (!hadObj) {
			this.lastObj = undefined
			this.objTimer = undefined
		}

		if (this.lastObj) {
			this.clickFactor = Math.min(this.core.abs_t - this.objTimer, 1.0)
			if (this.clickFactor == 1.0) {
				console.log('OnClick', this.lastObj.onClick.text)
				this.lastObj = undefined
				this.objTimer = undefined
			}
		}
		else {
			this.clickFactor = 0
		}
	}

	ThreeGazeClicker.prototype.update_state = function() {
		if (!this.scene || !this.camera) {
			return
		}

		this.update_click()

		var mesh = this.get_mesh()

		mesh.position.copy(this.camera.position)
		mesh.quaternion.copy(this.camera.quaternion)
		mesh.scale.copy(new THREE.Vector3(0.05, 0.05, 1.0))

		this.geometry.update(this.clickFactor)

		if (this.scene.children[1].children.indexOf(mesh) < 0) {
			this.scene.children[1].add(mesh)
		}

		this.updated = true
	}
})()