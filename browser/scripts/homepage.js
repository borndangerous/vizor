var $canvas, $window, $stage;

var hp = new function() {
	var _self = this;
	
	this.bind_ui = function() {
		$('.team-member').click(function() {
			window.open($(this).find('.profile-link').attr('href'));
		})
	}
	
	this.onResize = function() {
		setTimeout(function() {
			var width = $window.width();
			var height = $window.height() - parseInt($('body').css('paddingBottom'));
			var devicePixelRatio = window.devicePixelRatio || 1;
			var pixelRatioAdjustedWidth = devicePixelRatio * width;
			var pixelRatioAdjustedHeight = devicePixelRatio * height;

			$canvas[0].width = pixelRatioAdjustedWidth
			$canvas[0].height = pixelRatioAdjustedHeight
			$stage.css('width', width + 'px')
			$stage.css('height', height  + 'px')

			E2.core.emit('resize')
		}, 20)
	}
	
	this.init = function() {
		$canvas = $('#webgl-canvas');
		$window = $(window);
		$stage = $('.stage--front');

		window.Vizor = {
			hideWebVRButton: true
		}

		$(window).on('resize', _self.onResize)
		$(window).on('vizorLoaded', function() {
			E2.app.calculateCanvasArea = function() {
				return {
					width: $window.width(),
					height: $window.height()
				}
			}

		_self.onResize();
		_self.bind_ui();
		})
	};
}

jQuery(hp.init.bind(hp));