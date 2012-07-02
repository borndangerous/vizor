E2.plugins["random_float_generator"] = function(core, node) {
	var self = this;
	
	this.desc = 'Emits a random float constant in a specified interval.';
	this.input_slots = [ 
		{ name: 'min', dt: core.datatypes.FLOAT },
		{ name: 'max', dt: core.datatypes.FLOAT } 
	];
	this.output_slots = [ { name: 'value', dt: core.datatypes.FLOAT } ];
	
	this.lo = 0.0;
	this.hi = 1.0;
	this.value = 0.0;
	
	this.update_input = function(slot, data)
	{
		if(slot.index === 0)
			self.lo = data;
		else if(slot.index === 1)
			self.hi = data;
	};

	this.update_state = function(delta_t)
	{
		var l = self.lo;
		var h = self.hi;
		
		if(l > h)
		{
			var t = l;
			
			l = h;
			h = t;
		}
		
		self.value = l + (Math.random() * (h - l));
		self.updated = true;
	};
	
	this.update_output = function(slot)
	{
		return self.value;
	};
};