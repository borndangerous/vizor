g_Plugins["matrix_display"] = function(core) {
	var self = this;
	
	this.input_slots = [ 
		{ name: 'matrix', dt: core.datatypes.MATRIX }
	];
	
	this.output_slots = [];
	this.cell_vals = ['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'];
		
	this.create_ui = function()
	{
		self.table = make('table');
		self.columns = [];
		
		for(var r = 0; r < 4; r++)
		{
			var row = make('tr');
			
			for(var c = 0; c < 4; c++)
			{
				var col = make('td');
			
				col.html('-');
				col.css('text-align', 'right');
				col.css('padding-left', '10px');
				self.columns.push(col);
			
				row.append(col);
			}
			
			self.table.append(row);
		}		

		return self.table;
	};
	
	this.disconnect_input = function(index)
	{
		self.cell_vals = ['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'];
		self.update_values();
	};

	this.update_input = function(index, data)
	{
		var ofs = 0;
		
		for(var i = 0; i < 16; i++)
			self.cell_vals[i] = data[i].toFixed(2);
	
		self.update_values();
	};
	
	this.update_values = function()
	{
		for(var i = 0; i < 16; i++)
			self.columns[i].html(self.cell_vals[i])
	};
};