(function() {

function getChannelFromPath(pathname) {
	var p = pathname.split('/')

	if (p.length > 2)
		return p[1] + '/' + p[2]

	return p[1]
}

function isUserOwnedGraph(path) {
	return path.split('/').length > 1
}

function Application() {
	var that = this;

	E2.app = this

	this.state = {
		STOPPED: 0,
		PLAYING: 1,
		PAUSED: 2
	};

	this.canvas = E2.dom.canvas;
	this.c2d = E2.dom.canvas[0].getContext('2d');
	this.editConn = null;
	this.shift_pressed = false;
	this.ctrl_pressed = false;
	this.alt_pressed = false;
	this.hover_slot = null;
	this.hover_slot_div = null;
	this.hover_connections = [];
	this.hoverNode = null;
	this.scrollOffset = [0, 0];
	this.selection_start = null;
	this.selection_end = null;
	this.selection_last = null;
	this.selectedNodes = [];
	this.selectedConnections = [];
	this.selection_dom = null;
	this.clipboard = null;
	this.inDrag = false;
	this.resize_timer = null;
	this.is_osx = /mac os x/.test(navigator.userAgent.toLowerCase());
	this.condensed_view = false;
	this.collapse_log = true;
	this.selection_border_style = '1px solid #09f';
	this.normal_border_style = 'none';
	this.is_panning = false;
	this.noodlesVisible = !E2.util.isMobile();
	this.mousePosition = [400,200]
	this.path = getChannelFromPath(window.location.pathname)
	this.dispatcher = new Flux.Dispatcher()
	this.undoManager = new UndoManager()
	this.graphApi = new GraphApi(this.undoManager)
	this.graphStore = new GraphStore()
	this.peopleStore = new PeopleStore()
	this.peopleManager = new PeopleManager(this.peopleStore, $('#peopleTab'))

	// Make the UI visible now that we know that we can execute JS
	$('.nodisplay').removeClass('nodisplay');

}

Application.prototype.getNIDFromSlot = function(id) {
	return id.slice(1, id.indexOf('s'));
}

Application.prototype.getSIDFromSlot = function(id) {
	return id.slice(id.indexOf('s') + 2, id.length);
}

Application.prototype.offsetToCanvasCoord = function(ofs) {
	var o = [ofs.left, ofs.top];
	var co = E2.dom.canvas_parent.offset();
	var so = this.scrollOffset;

	o[0] -= co.left;
	o[1] -= co.top;

	o[0] += so[0];
	o[1] += so[1];

	return o;
};

Application.prototype.getSlotPosition = function(node, slot_div, type, result) {
	var area = node.open ? slot_div : node.ui.dom;
	if (!area) return false;
	var areaOffset = area.offset();
	if (!areaOffset) return false;
	var o = this.offsetToCanvasCoord(areaOffset);

	result[0] = Math.round(type === E2.slot_type.input ? o[0] : o[0] + area.width() + (node.open ? 0 : 5));
	result[1] = Math.round(o[1] + (area.height() / 2));
};

Application.prototype.instantiatePlugin = function(id, position) {
	var that = this
	var $canvasParent = E2.dom.canvas_parent
	var parentOffset = $canvasParent.offset()

	position = position || this.mousePosition

	function createPlugin(name) {
		var activeGraph = E2.core.active_graph

		var newX = Math.floor(position[0] + that.scrollOffset[0]);
		var newY = Math.floor(position[1] + that.scrollOffset[1]);
		var node = new Node(activeGraph, id, newX, newY);

		if (name) { // is graph?
			node.plugin.setGraph(new Graph(E2.core, activeGraph))
			node.title = name
			node.plugin.graph.plugin = node.plugin
		}

		that.graphApi.addNode(activeGraph, node)

		return node
	}

	var node

	if (id === 'graph')
		node = createPlugin('Graph')
	else if (id === 'loop')
		node = createPlugin('Loop')
	else if (id === 'array_function')
		node = createPlugin('Array function')
	else
		node = createPlugin(null)

	return node
}

Application.prototype.activateHoverSlot = function() {
	var that = this
	var hs = this.hover_slot;

	if(!hs)
		return true;

	// Mark any attached connection
	var conns = E2.core.active_graph.connections;
	var dirty = false;

	conns.some(function(c) {
		if (c.dst_slot === hs || c.src_slot === hs) {
			c.ui.deleting = true;
			that.hover_connections.push(c);
			dirty = true;

			if (hs.type === E2.slot_type.input)
				return true; // Early out if this is an input slot, but continue searching if it's an output slot. There might be multiple connections.
		}
	})

	if (dirty)
		this.updateCanvas(false);
	return true;
}

Application.prototype.releaseHoverSlot = function() {
	if (this.hover_slot) {
		this.setSlotCssClasses(this.hover_slot, this.hover_slot_div);
		this.hover_slot_div = null;
		this.hover_slot = null;
	}

	this.releaseHoverConnections();
	return true;
}

Application.prototype.setSlotCssClasses = function(slot, slot_div) {	/* @var slot_div jQuery */
	if (typeof slot_div === 'undefined') return false;
	if (!slot_div) return false;

	if (slot_div !== this.hover_slot_div)
		slot_div.removeClass('p_connecting')

	slot_div.removeClass('p_compatible')
			.removeClass('p_incompatible');

	if (slot && slot.is_connected)
		slot_div.addClass('p_connected')
	else
		slot_div.removeClass('p_connected');

	return true;
}

Application.prototype.onSlotClicked = function(node, slot, slot_div, type, e) {
	e.stopPropagation()

	if (!this.shift_pressed) {
		var graph = E2.core.active_graph

		if (type === E2.slot_type.output) {
			// drag new connection from output
			this.editConn = new EditConnection(
				this.graphApi,
				new Connection(node, null, slot),
				slot_div,
				null
			)

			slot_div.addClass('p_connecting');
			this.getSlotPosition(node, slot_div, E2.slot_type.output,
				this.editConn.ui.src_pos);

			var offset = 0;

			var ocs = graph.find_connections_from(node, slot);
			ocs.sort(function(a, b) {
				return a.offset < b.offset ? - 1 : a.offset > b.offset ? 1 : 0;
			})

			ocs.some(function(oc, i) {
				oc.offset = i;

				if (oc.offset != i) {
					offset = i;
					return true;
				}

				offset = i + 1;
			});

			this.editConn.offset = offset;

		} else { // drag connection from input
			var conn = graph.find_connection_to(node, slot);
			if (!conn) {
				// new connection from input
				this.editConn = new EditConnection(
					this.graphApi,
					new Connection(null, node, null, slot),
					null,
					slot_div)

				this.editConn.offset = 0;

				slot_div.addClass('p_connecting');

				this.getSlotPosition(node, slot_div, E2.slot_type.input,
					this.editConn.ui.src_pos);
			} else {
				this.editConn = new EditConnection(this.graphApi, conn, null, slot_div)
			}

			this.onSlotEntered(node, slot, slot_div);
		}
	} else {
		this.removeHoverConnections();
	}

	return false;
}

Application.prototype.onSlotEntered = function(node, slot, slot_div) {
	if (this.editConn) {
		if (this.editConn.hoverSlot(node, slot)) {	// returns canConnectTo()
			slot_div.removeClass('p_incompatible').addClass('p_compatible');
		} else {
			slot_div.removeClass('p_compatible').addClass('p_incompatible');
		}
	}

	this.hover_slot = slot;
	this.hover_slot_div = slot_div;

	if (this.shift_pressed)
		this.activateHoverSlot()

	return true;
}

Application.prototype.onSlotExited = function(node, slot, slot_div) {
	if (this.editConn) {
		this.editConn.blurSlot(slot)
	}
	this.setSlotCssClasses(slot, slot_div);
	this.releaseHoverSlot();
	return true;
}

Application.prototype.onMouseReleased = function() {
	var changed = false

	// Creating a connection?
	if (this.editConn) {
		var ec = this.editConn
		var old_connection_uid = ec.connection.uid;
		var success = false;

		this.editConn = null
		var c = ec.commit()

		success = (ec.connection && (old_connection_uid != ec.connection.uid));
		if (c)
			c.signal_change(true)

		if (ec.srcSlotDiv)
			this.setSlotCssClasses(ec.srcSlot, ec.srcSlotDiv);
		if (ec.dstSlotDiv)
			this.setSlotCssClasses(ec.dstSlot, ec.dstSlotDiv);

		changed = true
	}

	if (changed)
		this.updateCanvas(true);
	else
		E2.dom.structure.tree.on_mouse_up();

	this.releaseHoverSlot()
}

Application.prototype.updateCanvas = function(clear) {
	var c = this.c2d
	var canvas = this.canvas[0]

	if (clear)
		c.clearRect(0, 0, canvas.width, canvas.height)

	var conns = E2.core.active_graph.connections
	var cb = [[], [], [], []]
	var styles = ['#888', '#fd9720', '#09f', E2.erase_color]

	var connsLen = conns.length
	for (var i=0; i < connsLen; i++) {
		var cui = conns[i].ui
		// Draw inactive connections first, then connections with data flow,
		// next selected connections and finally selected connections to
		// ensure they get rendered on top.
		cb[cui.deleting ? 3 : cui.selected ? 2 : cui.flow ? 1 : 0].push(cui.parent_conn)
	}

	if (this.editConn)
		cb[0].push(this.editConn.connection)

	var so = this.scrollOffset;

	c.lineWidth = 2;
	c.lineCap = 'square';
	c.lineJoin = 'miter';

	for(var bin = 0; bin < 4; bin++) {
		var b = cb[bin];

		if(b.length > 0) {
			c.strokeStyle = styles[bin];
			c.beginPath();

			for(var i = 0, len = b.length; i < len; i++) {
				// Noodles!
				var cn = b[i].ui;
				var x1 = (cn.src_pos[0] - so[0]) + 0.5;
				var y1 = (cn.src_pos[1] - so[1]) + 0.5;
				var x4 = (cn.dst_pos[0] - so[0]) + 0.5;
				var y4 = (cn.dst_pos[1] - so[1]) + 0.5;
				var diffx = Math.max(16, x4 - x1);
				var x2 = x1 + diffx * 0.5;
				var x3 = x4 - diffx * 0.5;

				c.moveTo(x1, y1);
				c.bezierCurveTo(x2, y1, x3, y4, x4, y4);
			}

			c.stroke();
		}
	}

	// Draw selection fence (if any)
	if (this.selection_start) {
		var ss = this.selection_start;
		var se = this.selection_end;
		var so = this.scrollOffset;
		var s = [ss[0] - so[0], ss[1] - so[1]];
		var e = [se[0] - so[0], se[1] - so[1]];

		c.lineWidth = 2;
		c.strokeStyle = '#09f';
		c.strokeRect(s[0], s[1], e[0] - s[0], e[1] - s[1]);
	}
}

Application.prototype.mouseEventPosToCanvasCoord = function(e, result) {
	var cp = E2.dom.canvas_parent[0];

	result[0] = (e.pageX - cp.offsetLeft) + this.scrollOffset[0];
	result[1] = (e.pageY - cp.offsetTop) + this.scrollOffset[1];
};

Application.prototype.releaseHoverNode = function(release_conns) {
	if (this.hoverNode !== null) {
		this.hoverNode = null

		if (release_conns)
			this.releaseHoverConnections()
	}
}

Application.prototype.clearHoverState = function() {
	this.hover_slot = null;
	this.hover_slot_div = null;
	this.hover_connections = [];
	this.hoverNode = null;
};

Application.prototype.clearEditState = function()
{
	this.editConn = null;
	this.shift_pressed = false;
	this.ctrl_pressed = false;
	this.alt_pressed = false;
	this.clearHoverState()
};

Application.prototype.releaseHoverConnections = function() {
	this.hover_connections.map(function(hc) {
		hc.ui.deleting = false
	})

	this.hover_connections = []

	this.updateCanvas(false)
}

Application.prototype.removeHoverConnections = function() {
	this.hover_connections.map(function(connection) {
		this.graphApi.disconnect(E2.core.active_graph, connection)
	}.bind(this))

	this.hover_connections = []
}

Application.prototype.deleteSelectedConnections = function() {
	this.selectedConnections.map(function(connection) {
		this.graphApi.disconnect(E2.core.active_graph, connection)
	}.bind(this))

	this.hover_connections = []
}

Application.prototype.deleteSelectedNodes = function() {
	var that = this
	var hns = this.selectedNodes
	var ag = E2.core.active_graph

	this.undoManager.begin('Delete nodes')

	this.releaseHoverNode(false)

	this.deleteSelectedConnections()

	hns.forEach(function(n) {
		that.graphApi.removeNode(ag, n)
	})

	this.undoManager.end('Delete nodes')

	this.clearSelection()
}

Application.prototype.onNodeHeaderEntered = function(node) {
	this.hoverNode = node
}

Application.prototype.onNodeHeaderExited = function() {
	this.releaseHoverNode(true)
}

Application.prototype.onNodeHeaderMousedown = function() {
	if (!this.hoverNode)
		return;

	var isIn = this.isNodeInSelection(this.hoverNode)
	var addNode

	if (!this.shift_pressed) {
		if (!isIn) {
			this.clearSelection()
			addNode = this.hoverNode
		}
	} else {
		if (isIn)
			this.deselectNode(this.hoverNode)
		else
			addNode = this.hoverNode
	}

	if (addNode) {
		this.markNodeAsSelected(addNode)
		addNode.getConnections().map(this.markConnectionAsSelected.bind(this))
	}
}

Application.prototype.onNodeHeaderClicked = function() {
}

Application.prototype.onNodeHeaderDblClicked = function(node) {

}

Application.prototype.isNodeInSelection = function(node) {
	return this.selectedNodes.indexOf(node) > -1
}

Application.prototype.executeNodeDrag = function(nodes, conns, dx, dy) {
	var nl = nodes.length

	for(var i=0; i < nl; i++) {
		var node = nodes[i]
		node.x += dx
		node.y += dy

		if (!node.ui)
			continue;
		node.ui.setPosition(node.x,node.y);
	}

	var cl = conns.length
	if (cl && conns[0].ui) {
		for (var i=0; i < cl; i++) {
			E2.app.redrawConnection(conns[i])
		}
	}

	this.updateCanvas(true)
}

Application.prototype.onNodeDragged = function(node) {
	var nd = node.ui.dom[0]
	var dx = Math.floor(nd.offsetLeft) - Math.floor(node.x)
	var dy = Math.floor(nd.offsetTop) - Math.floor(node.y)

	if (!dx && !dy)
		return;

	if (!this.inDrag) {
		this.inDrag = true

		var nodes = [ node ]

		if (this.isNodeInSelection(node))
			nodes = this.selectedNodes

		this._dragInfo = {
			original: { x: node.x, y: node.y },
			connections: nodes.reduce(function(arr, curr) {
				return arr.concat(curr.getConnections())
			}, [])
		}

		this.undoManager.begin('Move')

		this._dragInfo.nodes = nodes
	}

	if (this._dragInfo)
		this.executeNodeDrag(this._dragInfo.nodes, this._dragInfo.connections, dx, dy)
}

Application.prototype.onNodeDragStopped = function(node) {
	this.onNodeDragged(node)

	if (!this._dragInfo) {
		this.inDrag = false
		return;
	}

	var di = this._dragInfo
	var nd = node.ui.dom[0]
	var dx = nd.offsetLeft - di.original.x
	var dy = nd.offsetTop - di.original.y

	var cmd = new E2.commands.graph.Move(
		E2.core.active_graph,
		di.nodes,
		dx, dy
	)

	this.undoManager.push(cmd)
	this.undoManager.end()

	this._dragInfo = null
	this.inDrag = false

	E2.app.channel.send({
		actionType: 'uiNodesMoved',
		graphUid: E2.core.active_graph.uid,
		nodeUids: di.nodes.map(function(n) { return n.uid }),
		delta: { x: dx, y: dy }
	})
}

Application.prototype.clearSelection = function() {
	var sn = this.selectedNodes;
	var sc = this.selectedConnections;

	for(var i = 0, len = sn.length; i < len; i++) {
		var nui = sn[i].ui;

		if(nui) {
			nui.setSelected(false);
		}
	}

	for(var i = 0, len = sc.length; i < len; i++) {
		var cui = sc[i].ui;

		if(cui)
			cui.selected = false;
	}

	this.selectedNodes = [];
	this.selectedConnections = [];

}

Application.prototype.redrawConnection = function(connection) {	/* @TODO: rename this method */
	var cn = connection
	if (!cn.ui) {
		console.warn('redrawConnection but no ui for ' + cn.uid);
		return;
	}
	var cui = cn.ui

	this.getSlotPosition(cn.src_node, cui.src_slot_div, E2.slot_type.output, cui.src_pos);
	this.getSlotPosition(cn.dst_node, cui.dst_slot_div, E2.slot_type.input, cui.dst_pos);
}

Application.prototype.onCanvasMouseDown = function(e) {
	if (e.target.id !== 'canvas')
		return;

	e.stopPropagation()
	e.preventDefault()

	if (e.which === 1) {
		this.selection_start = [0, 0];
		this.mouseEventPosToCanvasCoord(e, this.selection_start);
		this.selection_end = this.selection_start.slice(0);
		this.selection_last = [e.pageX, e.pageY];
		this.clearSelection();
		this.selection_dom = E2.dom.canvas_parent.find(':input').addClass('noselect'); //.attr('disabled', 'disabled');
	} else if (e.which === 2) {
		this.is_panning = true;
		this.canvas[0].style.cursor = 'move';
		e.preventDefault();
		return;
	} else {
		this.releaseSelection()
		this.clearSelection()
		E2.app.updateCanvas()
	}

	this.updateCanvas(false)
}

Application.prototype.releaseSelection = function()
{
	this.selection_start = null;
	this.selection_end = null;
	this.selection_last = null;

	if(this.selection_dom)
		this.selection_dom.removeClass('noselect'); // .removeAttr('disabled');

	this.selection_dom = null;
};

Application.prototype.onCanvasMouseUp = function(e)
{
	if(e.which === 2)
	{
		this.is_panning = false;
		this.canvas[0].style.cursor = '';
		e.preventDefault();
		return;
	}

	if(!this.selection_start)
		return;

	this.releaseSelection();

	var nodes = this.selectedNodes;

	if(nodes.length)
	{
		var sconns = this.selectedConnections;

		var insert_all = function(clist)
		{
			for(var i = 0, len = clist.length; i < len; i++)
			{
				var c = clist[i];
				var found = false;

				for(var ci = 0, cl = sconns.length; ci < cl; ci++)
				{
					if(c === sconns[ci])
					{
						found = true;
						break;
					}
				}

				if(!found)
				{
					c.ui.selected = true;
					sconns.push(c);
				}
			}
		};

		// Select all pertinent connections
		for(var i = 0, len = nodes.length; i < len; i++)
		{
			var n = nodes[i];

			insert_all(n.inputs);
			insert_all(n.outputs);
		}
	}

	this.inDrag = false;
	this.updateCanvas(true);

	// Clear focus to prevent problems with the user dragging over text areas (bringing them in focus) during selection.
	if(document.activeElement)
			document.activeElement.blur();
};

Application.prototype.onMouseMoved = function(e) {
	this.mousePosition = [e.pageX, e.pageY];

	if(this.is_panning) {
		var cp = E2.dom.canvas_parent

		if(e.movementX) {
			cp.scrollLeft(this.scrollOffset[0]-e.movementX)
			this.scrollOffset[0] = cp.scrollLeft()
		}

		if(e.movementY) {
			cp.scrollTop(this.scrollOffset[1]-e.movementY)
			this.scrollOffset[1] = cp.scrollTop()
		}

		e.preventDefault()
		return
	} else if(this.editConn) {
		var cp = E2.dom.canvas_parent
		var pos = cp.position()
		var w = cp.width()
		var h = cp.height()
		var x2 = pos.left + w
		var y2 = pos.top + h

		if(e.pageX < pos.left)
			cp.scrollLeft(this.scrollOffset[0] - 20)
		else if(e.pageX > x2)
			cp.scrollLeft(this.scrollOffset[0] + 20)

		if(e.pageY < pos.top)
			cp.scrollTop(this.scrollOffset[1] - 20)
		else if(e.pageY > y2)
			cp.scrollTop(this.scrollOffset[1] + 20)

		this.mouseEventPosToCanvasCoord(e, this.editConn.ui.dst_pos)
		this.updateCanvas(true)

		return
	} else if(!this.selection_start) {
		E2.dom.structure.tree.on_mouse_move(e)
		return
	}

	if (this.selection_end)
		return this._performSelection(e)
}

Application.prototype._performSelection = function(e) {
	this.mouseEventPosToCanvasCoord(e, this.selection_end)

	var nodes = E2.core.active_graph.nodes
	var cp = E2.dom.canvas_parent

	var ss = this.selection_start.slice(0)
	var se = this.selection_end.slice(0)

	for(var i = 0; i < 2; i++) {
		if (se[i] < ss[i]) {
			var t = ss[i]
			ss[i] = se[i]
			se[i] = t
		}
	}

	var sn = this.selectedNodes
	var ns = []

	for(var i = 0, len = sn.length; i < len; i++)
		sn[i].ui.setSelected(false);

	for(var i = 0, len = nodes.length; i < len; i++) {
		var n = nodes[i]
		if (n && (typeof n.ui === 'undefined')) continue; // recover, should a node ref ever break..
		var nui = n.ui.dom[0]
		var p_x = nui.offsetLeft
		var p_y = nui.offsetTop
		var p_x2 = p_x + nui.clientWidth
		var p_y2 = p_y + nui.clientHeight

		if (se[0] < p_x || se[1] < p_y || ss[0] > p_x2 || ss[1] > p_y2)
			continue; // No intersection.

		if (!n.ui.selected) 	{
			this.markNodeAsSelected(n, false)
			ns.push(n)
		}
	}

	for(var i = 0, len = sn.length; i < len; i++) {
		var n = sn[i]

		if (!n.ui.selected) n.ui.setSelected(false);
	}

	this.selectedNodes = ns

	var co = cp.offset();
	var w = cp.width();
	var h = cp.height();
	var dx = e.pageX - this.selection_last[0];
	var dy = e.pageY - this.selection_last[1];

	if((dx < 0 && e.pageX < co.left + (w * 0.15)) || (dx > 0 && e.pageX > co.left + (w * 0.85)))
		cp.scrollLeft(this.scrollOffset[0] + dx);

	if((dy < 0 && e.pageY < co.top + (h * 0.15)) || (dy > 0 && e.pageY > co.top + (h * 0.85)))
		cp.scrollTop(this.scrollOffset[1] + dy);

	this.selection_last[0] = e.pageX;
	this.selection_last[1] = e.pageY;

	this.updateCanvas(true);
}

Application.prototype.selectionToObject = function(nodes, conns, sx, sy) {
	var d = {};
	var x1 = 9999999.0, y1 = 9999999.0, x2 = 0, y2 = 0;

	sx = sx || 50
	sy = sy || 50

	d.nodes = [];
	d.conns = [];

	for(var i = 0, len = nodes.length; i < len; i++) {
		var n = nodes[i];
		var dom = n.ui ? n.ui.dom : null;
		var p = dom ? dom.position() : { left: n.x, top: n.y };
		var b = [p.left, p.top, p.left + (dom ? dom.width() : 0), p.top + (dom ? dom.height() : 0)];

		if(dom)
			n = n.serialise();

		if(b[0] < x1) x1 = b[0];
		if(b[1] < y1) y1 = b[1];
		if(b[2] > x2) x2 = b[2];
		if(b[3] > y2) y2 = b[3];

		d.nodes.push(n);
	}

	d.x1 = x1 + sx;
	d.y1 = y1 + sy;
	d.x2 = x2 + sx;
	d.y2 = y2 + sy;

	for(var i = 0, len = conns.length; i < len; i++) {
		var c = conns[i];
		d.conns.push(c.ui ? c.serialise() : c);
	}

	return d;
}

Application.prototype.fillCopyBuffer = function(nodes, conns, sx, sy) {
	this.clipboard = JSON.stringify(this.selectionToObject(nodes, conns, sx, sy))
	msg('Copy.')
};

Application.prototype.onDelete = function(e) {
	if (!this.selectedNodes.length)
		return;

	this.hoverNode = this.selectedNodes[0];
	this.deleteSelectedNodes();
}

Application.prototype.onCopy = function(e) {
	if (this.selectedNodes.length < 1) {
		msg('Copy: Nothing selected.');
		e.stopPropagation();
		return false;
	}

	this.fillCopyBuffer(this.selectedNodes, this.selectedConnections, this.scrollOffset[0], this.scrollOffset[1]);
	e.stopPropagation();
	return false;
};

Application.prototype.onCut = function(e) {
	if (this.selectedNodes.length > 0) {
		this.undoManager.begin('Cut')
		this.onCopy(e)
		this.onDelete(e)
		this.undoManager.end()
	}
}

Application.prototype.paste = function(srcDoc, offsetX, offsetY) {
	this.undoManager.begin('Paste')

	var ag = E2.core.active_graph
	var createdNodes = []
	var createdConnections = []

	function mapSlotIds(sids, uidMap) {
		var nsids = {}
		Object.keys(sids).map(function(oldUid) {
			nsids[uidMap[oldUid]] = sids[oldUid]
		})
		return nsids
	}

	function remapGraph(g, graphNode) {
		var uidMap = {}
		var graph = _.clone(g)

		graph.uid = E2.uid()

		graph.nodes.map(function(node) {
			var newUid = E2.core.get_uid()
			uidMap[node.uid] = newUid
			node.uid = newUid

			if (['graph', 'loop', 'array_function'].indexOf(node.plugin) > -1)
				node.graph = remapGraph(node.graph, node)
		})

		if (graphNode) {
			var s = graphNode.state

			if (s.input_sids)
				s.input_sids = mapSlotIds(s.input_sids, uidMap)

			if (s.output_sids)
				s.output_sids = mapSlotIds(s.output_sids, uidMap)
		}

		graph.conns.map(function(conn) {
			conn.src_nuid = uidMap[conn.src_nuid]
			conn.dst_nuid = uidMap[conn.dst_nuid]
			conn.uid = E2.uid()
		})

		return graph
	}

	// remap all UID's inside the pasted doc so they are unique in the graph tree.
	var doc = remapGraph(srcDoc)

	for(var i = 0, len = doc.nodes.length; i < len; i++) {
		var docNode = doc.nodes[i]
		docNode.x = Math.floor((docNode.x - doc.x1) + offsetX)
		docNode.y = Math.floor((docNode.y - doc.y1) + offsetY)

		this.graphApi.addNode(ag, Node.hydrate(ag.uid, docNode))

		createdNodes.push(ag.findNodeByUid(docNode.uid))
	}

	for(i = 0, len = doc.conns.length; i < len; i++) {
		var dc = doc.conns[i]

		var destNode = ag.findNodeByUid(dc.dst_nuid)
		if (!destNode)
			continue;

		var slots = dc.dst_dyn ? destNode.dyn_inputs : destNode.plugin.input_slots
		var slot = slots[dc.dst_slot]

		if (!slot)
			continue;
	
		if (dc.src_nuid === undefined || dc.dst_nuid === undefined) {
			// not a valid connection, clear it and skip it
			if (dc.dst_nuid !== undefined) {
				slot.is_connected = false
				slot.connected = false
				destNode.inputs_changed = true
			}

			continue;
		}

		this.graphApi.connect(ag, Connection.hydrate(E2.core.active_graph, dc))

		createdConnections.push(ag.findConnectionByUid(dc.uid))
	}

	this.undoManager.end()

	return { nodes: createdNodes, connections: createdConnections }
}

Application.prototype.onPaste = function() {
	if (this.clipboard === null)
		return;

	this.clearSelection()

	var doc = JSON.parse(this.clipboard)
	var cp = E2.dom.canvas_parent
	var sx = this.scrollOffset[0]
	var sy = this.scrollOffset[1]

	var ox = Math.max(this.mousePosition[0] - cp.position().left + sx, 100)
	var oy = Math.max(this.mousePosition[1] - cp.position().top + sy, 100)

	var pasted = this.paste(doc, ox, oy)

	pasted.nodes.map(this.markNodeAsSelected.bind(this))
	pasted.connections.map(this.markConnectionAsSelected.bind(this))
}

Application.prototype.markNodeAsSelected = function(node, addToSelection) {
	if (node.ui) {
		node.ui.setSelected(true);
	}

	if (addToSelection !== false)
		this.selectedNodes.push(node)
}

Application.prototype.deselectNode = function(node) {
	this.selectedNodes.splice(this.selectedNodes.indexOf(node), 1)
	node.ui.setSelected(false);
}

Application.prototype.markConnectionAsSelected = function(conn) {
	if (conn.ui)
		conn.ui.selected = true
	this.selectedConnections.push(conn)
}

Application.prototype.selectAll = function() {
	this.clearSelection()

	var ag = E2.core.active_graph

	ag.nodes.map(this.markNodeAsSelected.bind(this))
	ag.connections.map(this.markConnectionAsSelected.bind(this))

	this.updateCanvas(true)
};

/**
 * Calculate real area left for canvas
 * @return {Object} Canvas area
 */
Application.prototype.calculateCanvasArea = function() {
	var width, height
	var isFullscreen = !!(document.mozFullScreenElement || document.webkitFullscreenElement)

	if (!isFullscreen && !this.condensed_view) {
		width = $(window).width();
		height = $(window).height() -
			$('.editor-header').outerHeight(true) - $('#breadcrumb').outerHeight(true) - $('.bottom-panel').outerHeight(true);
	} else {
		width = window.innerWidth
		height = window.innerHeight
	}

	return {
		width: width,
		height: height
	};
}

Application.prototype.onWindowResize = function() {
	var isFullscreen = !!(document.mozFullScreenElement || document.webkitFullscreenElement)

	if (isFullscreen) {
		E2.core.emit('resize')
		return;
	}

	var canvasArea = this.calculateCanvasArea();
	var width = canvasArea.width;
	var height = canvasArea.height;

	// Set noodles and DOM element container size
	E2.dom.canvas_parent.css('width', width);
	E2.dom.canvas_parent.css('height', height);

	// Set noodles canvas size
	E2.dom.canvas[0].width = width;
	E2.dom.canvas[0].height = height;
	E2.dom.canvas.css('width', width);
	E2.dom.canvas.css('height', height);

	// set webgl canvas size
	E2.dom.webgl_canvas[0].width = width;
	E2.dom.webgl_canvas[0].height = height;
	E2.dom.webgl_canvas.css('width', width);
	E2.dom.webgl_canvas.css('height', height);

	E2.core.emit('resize')

	this.updateCanvas(true)
}

Application.prototype.toggleNoodles = function() {
	this.noodlesVisible = !this.noodlesVisible;
	E2.ui.togglePatchEditor(this.noodlesVisible);
}

Application.prototype.toggleWorldEditor = function() {
	var is_active = this.worldEditor.isActive()
	if (is_active) {
		this.worldEditor.deactivate()
	}
	else {
		this.worldEditor.activate()
	}
	is_active = this.worldEditor.isActive()

	if (E2.ui)
		E2.ui.setWorldEditorMode(is_active)

	return is_active
}

Application.prototype.isVRCameraActive = function() {
	//console.log('noodles:', this.noodlesVisible, 'we: ', E2.app.worldEditor)
	return !(this.noodlesVisible || E2.app.worldEditor.isActive())
}
	
Application.prototype.toggleFullscreen = function() {
	E2.core.emit('fullScreenChangeRequested')
}

Application.prototype.onFullScreenChanged = function() {
	var $canvas = E2.dom.webgl_canvas
	var isFullscreen = !!(document.mozFullScreenElement || document.webkitFullscreenElement)

	if (isFullscreen) {
		$canvas.removeClass('webgl-canvas-normal')
		$canvas.addClass('webgl-canvas-fs')
	} else {
		$canvas.removeClass('webgl-canvas-fs')
		$canvas.addClass('webgl-canvas-normal')
	}

	E2.app.onWindowResize()

	E2.core.emit('fullScreenChanged')
}

Application.prototype.onKeyDown = function(e) {
	// best to return something here, as webkit sometimes has issues with null returns
	// return true, unless the ball stops here, in which case return false after stopPropagation and/or preventDefault

	var that = this

	if (E2.ui.isModalOpen()) return true;

	if (E2.util.isTextInputInFocus(e))
		return true;
	
	var toggleFullScreenKey = 70
	var toggleNoodlesKey = 9
	var toggleWorldEditorKey = 86

	var exceptionKeys = [ toggleFullScreenKey, toggleNoodlesKey, toggleWorldEditorKey ]

	if (this.isVRCameraActive() && exceptionKeys.indexOf(e.keyCode) === -1)
		return true;

	var ret = true;

	// arrow up || down
	var arrowKeys = [37,38,39,40]
	if (arrowKeys.indexOf(e.keyCode) !== -1) {
		var dx = 0, dy = 0

		if (e.keyCode === 37) dx = -10
		if (e.keyCode === 39) dx = 10
		if (e.keyCode === 38) dy = -10
		if (e.keyCode === 40) dy = 10

		if (this.selectedNodes.length) {
			that.executeNodeDrag(this.selectedNodes,
				this.selectedConnections,
				dx, dy)
		}
		e.preventDefault()
		ret = false;
	}

	if (e.keyCode === 8 || e.keyCode === 46) { // use backspace and delete for deleting nodes
		this.onDelete(e);
		e.preventDefault();
		ret = false;
	}
	else if(e.keyCode === 13) { // enter = deselect (eg. commit move)
		this.clearEditState()
		this.clearSelection()
		ret = false;
	}
	else if(e.keyCode === 16) // .isShift doesn't work on Chrome. This does.
	{
		this.shift_pressed = true;
		this.activateHoverSlot();
	}
	else if(e.keyCode === 17 || e.keyCode === 91) // CMD on OSX, CTRL on everything else
	{
		this.ctrl_pressed = true;
	}
	else if(e.keyCode === 18) // alt
	{
		this.alt_pressed = true;
	}


	// number keys
	else if (e.keyCode > 47 && e.keyCode < 58) { // 0-9
		if (this.ctrl_pressed || this.shift_pressed || this.alt_pressed)
			return true;

		var numberHotKeys = [
			'plugin:output_proxy', // 0
			'plugin:input_proxy', // 1
			'plugin:graph', // 2
			'plugin:slider_float_generator', // 3
			'plugin:const_float_generator', // 4
			'plugin:float_display', // 5
			'plugin:multiply_modulator', // 6
			'preset:time_oscillate_between_2_values', // 7
			'preset:image_show_image', // 8
			'plugin:knob_float_generator' // 9
		]

		var item = numberHotKeys[e.keyCode - 48]
		var name = item.substring(7)
		if (item.indexOf('preset:') === 0)
			that.presetManager.openPreset('/presets/'+name+'.json')
		else
			this.instantiatePlugin(name)

		ret = false;
	}


	else if(e.keyCode === toggleFullScreenKey) // f
	{
		this.toggleFullscreen()
		e.preventDefault();
		ret = false;
	}
	else if(this.ctrl_pressed || e.metaKey)
	{
		if(e.keyCode === 65) // CTRL+a
		{
			this.selectAll();
			e.preventDefault(); // FF uses this combo for opening the bookmarks sidebar.
			e.stopPropagation();
			return false;
		}
		else if(e.keyCode === 76) // CTRL+l
		{
			return false;
		}

		if(e.keyCode === 67) // CTRL+c
			this.onCopy(e);
		else if(e.keyCode === 88) // CTRL+x
			this.onCut(e);
		else if(e.keyCode === 86) // CTRL+v
			this.onPaste(e);

		if (e.keyCode === 90) { // z
			e.preventDefault()
			e.stopPropagation()
			ret = false;

			if (!this.shift_pressed)
				this.undoManager.undo()
			else
				this.undoManager.redo()
		}
	}
	else if (e.keyCode === toggleWorldEditorKey) { // v
		this.toggleWorldEditor();
		ret = false;
	}

	return ret;

};


Application.prototype.onKeyUp = function(e)
{
	if(e.keyCode === 17 || e.keyCode === 91) // CMD on OSX, CTRL on everything else
	{
		this.ctrl_pressed = false;
	}
	else if (e.keyCode === 18)
	{
		this.alt_pressed = false;
	}
	else if(e.keyCode === 16)
	{
		this.shift_pressed = false;
		this.releaseHoverSlot();
		this.releaseHoverNode(false);
	}
};

Application.prototype.changeControlState = function()
{
	var s = this.player.state;
	var cs = this.player.current_state;

	if (cs !== s.PLAYING) {
		E2.dom.playPauseIcon.attr('xlink:href','#icon-play')
		E2.dom.stop.addClass('disabled')
		E2.dom.stop.parent().addClass('active');
		E2.dom.play.parent().removeClass('active');
	} else {
		E2.dom.playPauseIcon.attr('xlink:href','#icon-pause')
		E2.dom.stop.removeClass('disabled')
		E2.dom.stop.parent().removeClass('active');
		E2.dom.play.parent().addClass('active');
	}
}

Application.prototype.onPlayClicked = function()
{
	if (this.player.current_state === this.player.state.PLAYING)
		this.player.pause();
	else
		this.player.play();
		
	E2.dom.stop.parent().removeClass('active');
	E2.dom.play.parent().addClass('active');
	
	this.changeControlState();
};

Application.prototype.onPauseClicked = function() {
	this.player.pause()
	this.changeControlState()
}

Application.prototype.onStopClicked = function() {
	this.player.schedule_stop(this.changeControlState.bind(this))
	E2.dom.stop.parent().addClass('active');
	E2.dom.play.parent().removeClass('active');
}

Application.prototype.onOpenClicked = function() {
	var that = this

	FileSelectControl
		.createGraphSelector(null, 'Open', function(path) {
			history.pushState({
				graph: { path: path }
			}, '', path + '/edit')

			that.path = getChannelFromPath(window.location.pathname)

			E2.app.midPane.closeAll()

			E2.app.loadGraph('/data/graph'+path+'.json')
		})
}



Application.prototype.loadGraph = function(graphPath, cb) {
	var that = this

	E2.app.onStopClicked()
	E2.app.player.on_update()

	E2.app.player.load_from_url(graphPath, function() {
		that.setupEditorChannel().then(function() {
			E2.core.rebuild_structure_tree()
			E2.app.onGraphSelected(E2.core.active_graph)

			E2.app.player.play() // autoplay
			E2.app.changeControlState()
			
			E2.ui.setPageTitle();

			if (cb)
				cb()
		})
	})
}

Application.prototype.onSaveAsPresetClicked = function() {
	this.openPresetSaveDialog()
}

Application.prototype.onSaveSelectionAsPresetClicked = function() {
	var graph = this.selectionToObject(this.selectedNodes, this.selectedConnections)
	this.openPresetSaveDialog(JSON.stringify({ root: graph }))
}

Application.prototype.openPresetSaveDialog = null;	// ui replaces this


Application.prototype.onPublishClicked = function() {
	if (!E2.models.user.get('username')) {
		return E2.controllers.account.openLoginModal()
			.then(this.onPublishClicked.bind(this))
	}
	
	E2.ui.openPublishGraphModal()
	.then(function(path) {
		window.location.href = path
	})
}

Application.prototype.onSaveACopyClicked = function() {
	this.openSaveACopyDialog();
}

Application.prototype.openSaveACopyDialog = function() {
	var that = this
	var dfd = when.defer()

	if (!E2.models.user.get('username')) {
		return E2.controllers.account.openLoginModal()
			.then(this.openSaveACopyDialog.bind(this))
	}

	E2.ui.updateProgressBar(65);

	ga('send', 'event', 'Save a Copy', 'clicked')

	$.get(URL_GRAPHS, function(files) {
		var fcs = new FileSelectControl()
		.frame('save-frame')
		.template('graph')
		.header('Save as')
		.buttons({
			'Cancel': function() {
				E2.ui.updateProgressBar(100);
			},
			'Save': function(path, tags) {
				if (!path)
					return bootbox.alert('Please enter a filename');

				var ser = that.player.core.serialise();

				$.ajax({
					type: 'POST',
					url: URL_GRAPHS,
					data: {
						path: path,
						tags: tags,
						graph: ser
					},
					dataType: 'json',
					success: function(saved) {
						E2.ui.updateProgressBar(100);
						ga('send', 'event', 'graph', 'saved')
						dfd.resolve(saved.path)
					},
					error: function(x, t, err) {
						E2.ui.updateProgressBar(100);

						if (x.status === 401) {
							return dfd.resolve(
								E2.controllers.account.openLoginModal()
									.then(that.openSaveACopyDialog.bind(that))
							)
						}

						if (x.responseText)
							bootbox.alert('Save failed: ' + x.responseText);
						else
							bootbox.alert('Save failed: ' + err);

						dfd.reject(err)
					}
				})
			}
		})
		.files(files)
		.modal()

		return fcs
	})

	return dfd.promise
}

Application.prototype.growl = function(title, type, duration, person) {
	var letter=title.charAt(0);
	var image=''
	type= type || 'info';
	if (!$('symbol#icon-'+type).length) {
		type='info'
	}
	if (person) {
		var image='<div style="background-color: '+person.color+';" class="image-crop"><span>'+letter+'</span></div>';
	} 
	
	/** TODO: when users will have pics - use this:
	if (person.userpic) {
		image = '<div style="background-image: url('+person.userpic+');" class="image-crop"></div>';
	}
	*/
	
	var glyph = '<div class="glyph">'+image+'<svg class="icon-'+type+'"><use xlink:href="#icon-'+type+'"></use></svg></div>';
	
	if (!$('#notifications-area').length) {
		$('body').append('<div id="notifications-area"></div>');
	}
	
	function close() {
		$('#notifications-area>.notification-show:first-child').removeClass('notification-show').addClass('notification-hide');
	}
	
	function remove() {
		$('.notification-hide:first-child').remove();
		$('#notifications-area>.notification-show:first-child').removeClass('notification-show').addClass('notification-hide');
		if (!$('#notifications-area>div').length) {
			$('#notifications-area').remove();
		}
	}

	$('#notifications-area').append('<div class="notification notification-show"><div class="nt-content">'+glyph+'<div class="text"><span>'+title+'</span></div></div></div>');
	
	duration = duration || 2000;
	
	setTimeout(close, duration * $('#notifications-area .notification').length)
	setTimeout(remove, duration * $('#notifications-area .notification').length + 1000)
}

Application.prototype.setupStoreListeners = function() {
	function onGraphChanged() {
		if (E2.core.active_graph.plugin)
			E2.core.active_graph.plugin.updated = true

		E2.app.updateCanvas(true)
	}

	function onNodeAdded(graph, node) {
		if (graph === E2.core.active_graph) {
			node.create_ui()

			if (node.ui && node.plugin.state_changed)
				node.plugin.state_changed(node.ui.plugin_ui)
		}

		if (node.plugin.isGraph)
			E2.core.rebuild_structure_tree()
	}

	function onNodeRemoved(graph, node) {
		node.destroy_ui()

		if (node.plugin.isGraph)
			E2.core.rebuild_structure_tree()
	}

	function onNodeRenamed(graph, node) {
		if (node.ui)
			node.ui.dom.find('.t').text(node.title)
		
		if (node.plugin.isGraph)
			node.plugin.graph.tree_node.set_title(node.title)

		if (node.plugin.renamed)
			node.plugin.renamed()
	}

	function onConnected(graph, connection) {
		connection.patch_up()

		if (graph === E2.core.active_graph) {
			if (!connection.ui)
				connection.create_ui()
			connection.ui.resolve_slot_divs()
		}

		connection.signal_change(true)
	}

	function onDisconnected(graph, connection) {
		try {
			connection.signal_change(false)
		} catch(e) {
			console.error(e.stack)
		}

		connection.destroy_ui()
	}

	this.graphStore
	.on('snapshotted', function() {
		E2.core.rebuild_structure_tree()
		E2.app.onGraphSelected(E2.core.active_graph)
	})
	.on('changed', onGraphChanged.bind(this))
	.on('nodeAdded', onNodeAdded.bind(this))
	.on('nodeRemoved', onNodeRemoved.bind(this))
	.on('nodeRenamed', onNodeRenamed.bind(this))
	.on('connected', onConnected.bind(this))
	.on('disconnected', onDisconnected.bind(this))
	.on('reordered', function() {
		E2.core.rebuild_structure_tree()
	})
}

Application.prototype.onGraphSelected = function(graph) {
	var that = this

	E2.core.active_graph.destroy_ui()
	E2.core.active_graph = graph

	E2.dom.canvas_parent.scrollTop(0)
	E2.dom.canvas_parent.scrollLeft(0)
	this.scrollOffset[0] = this.scrollOffset[1] = 0

	E2.dom.breadcrumb.children().remove()

	function buildBreadcrumb(parentEl, graph, add_handler) {
		var sp = $('<span>' + graph.tree_node.title + '</span>')
		sp.css('cursor', 'pointer')

		if (add_handler) {
			sp.click(function() {
				graph.tree_node.activate()
			})

			sp.css({ 'text-decoration': 'underline' })
		}

		parentEl.prepend($('<svg class="breadcrumb-separator"><use xlink:href="#breadcrumb-separator"></use></svg>'))
		parentEl.prepend(sp)

		if (graph.parent_graph)
			buildBreadcrumb(parentEl, graph.parent_graph, true)
	}

	buildBreadcrumb(E2.dom.breadcrumb, E2.core.active_graph, false)

	E2.core.active_graph.create_ui()

	this.peopleStore.list().map(function(person) {
		if (person.uid === that.channel.uid)
			return

		if (person.activeGraphUid !== E2.core.active_graph.uid)
			that.mouseCursors[person.uid].hide()
		else
			that.mouseCursors[person.uid].show()
	})

	E2.core.active_graph_dirty = true

	E2.app.updateCanvas(true)
}

Application.prototype.setupPeopleEvents = function() {
	var that = this
	var cursors = this.mouseCursors = {}
	var lastMovementTimeouts = this.lastMovementTimeouts = {}

	this.peopleStore.on('removed', function(uid) {
		if (uid === that.channel.uid)
			return;

		var $cursor = cursors[uid]

		// this can happen when reconnected and own uid changes
		// and the previous uid gets a `removed` message.
		if (!$cursor) 
			return;

		$cursor.remove()
		delete cursors[uid]
		if (E2.ui)
			E2.ui.onPeopleListChanged('removed');
	})

	this.peopleStore.on('added', function(person) {
		if (person.uid === that.channel.uid)
			return;

		if (cursors[person.uid])
			return;

		var $cursor = $('<div>')
		cursors[person.uid] = $cursor
		lastMovementTimeouts[person.uid] = undefined

		$cursor.addClass('remote-mouse-pointer')
		$cursor.addClass('inactive')
		$cursor.addClass('user-'+person.uid)
		$cursor.css('background-color', person.color)
		$cursor.appendTo('body')

		if (person.activeGraphUid !== E2.core.active_graph.uid)
			$cursor.hide()

		if (E2.ui)
			E2.ui.onPeopleListChanged('added');
	})

	this.peopleStore.on('mouseMoved', function(person) {
		var $cursor = cursors[person.uid]
		var cp = E2.dom.canvas_parent[0];
		$cursor.removeClass('inactive outside')

		// Update the user's cursor fade-out timeout
		clearTimeout(lastMovementTimeouts[person.uid])
		lastMovementTimeouts[person.uid] = setTimeout(function() {
			$cursor.addClass('inactive')
		}, 2000);

		// Received x/y are coordinates atop the canvas.
		var adjustedX = person.x;
		var adjustedY = person.y;
		var cursorIsOutsideViewportX = false;
		var cursorIsOutsideViewportY = false;

		// Calculate viewport top left and bottom right X/Y 
		var viewPortLeftX = E2.app.scrollOffset[0];
		var viewPortTopY = E2.app.scrollOffset[1];

		var viewPortBottomY = E2.app.scrollOffset[1] + E2.app.canvas.height();
		var viewPortRightX = E2.app.scrollOffset[0] + E2.app.canvas.width();

		if(adjustedX < viewPortLeftX) { // On left of the viewport
			adjustedX = cp.offsetLeft;
			cursorIsOutsideViewportX = true;
		}
		else if(adjustedX > viewPortRightX) { // On right side of the viewport
			adjustedX = $(window).width();
			cursorIsOutsideViewportX = true;
		}

		if(adjustedY < viewPortTopY) { // Above viewport
			adjustedY = cp.offsetTop;
			cursorIsOutsideViewportY = true;
		}
		else if(adjustedY > viewPortBottomY) { // Below viewport
			adjustedY = $(window).height();
			cursorIsOutsideViewportY = true;
		}

		if(cursorIsOutsideViewportX) { // If cursor is outside viewport boundaries, blur the cursor
			$cursor.addClass('outside')
		}
		else { // Otherwise, just adjust the received X position for current viewport scrolling so we can get a position relative to the canvas
			adjustedX += cp.offsetLeft - E2.app.scrollOffset[0];
		}

		if(cursorIsOutsideViewportY) { 
			$cursor.addClass('outside')
		}
		else { 
			adjustedY += cp.offsetTop - E2.app.scrollOffset[1];
		}

		$cursor.css('left', adjustedX)
		$cursor.css('top', adjustedY)

	})

	this.peopleStore.on('mouseClicked', function(uid) {
		var $cursor = cursors[uid]
		$cursor.addClass('clicked')

		setTimeout(function() {
			$cursor.removeClass('clicked')
		}, 100)


		clearTimeout(lastMovementTimeouts[uid])
		lastMovementTimeouts[uid] = setTimeout(function() {
			$cursor.addClass('inactive')
		}, 2000);

	})

	this.peopleStore.on('activeGraphChanged', function(person) {
		if (E2.app.channel.uid === person.uid) // it's for me
			return E2.app.onGraphSelected(Graph.lookup(person.activeGraphUid))

		var $cursor = cursors[person.uid]
		if (person.activeGraphUid === E2.core.active_graph.uid) 
			$cursor.show()
		else
			$cursor.hide()
	})
}

Application.prototype.onNewClicked = function() {
	window.location.href = '/edit';
}

Application.prototype.onForkClicked = function() {
	this.channel.fork()
}

Application.prototype.onAccountMenuClicked = function() {
	var username = E2.models.user.get('username')
	if (username) {
		E2.dom.userPullDown.toggle();
	}
}

Application.prototype.useCustomBootboxTemplate = function(template) {
	$('.modal-content').hide().html(template).show();
	$('.bootbox-close-button').attr('style','');
}

Application.prototype.start = function() {
	var that = this

	E2.core.pluginManager.on('created', this.instantiatePlugin.bind(this))

	document.addEventListener('mouseup', this.onMouseReleased.bind(this))
	document.addEventListener('mousemove', this.onMouseMoved.bind(this))
	document.body.addEventListener('keydown', this.onKeyDown.bind(this))
	document.body.addEventListener('keyup', this.onKeyUp.bind(this))

	E2.dom.canvas_parent[0].addEventListener('scroll', function() {
		that.scrollOffset = [ E2.dom.canvas_parent.scrollLeft(), E2.dom.canvas_parent.scrollTop() ]
		var s = E2.dom.canvas[0].style

		s.left = that.scrollOffset[0] + 'px'
		s.top = that.scrollOffset[1] + 'px'

		that.updateCanvas(true)
	})

	E2.dom.canvas_parent[0].addEventListener('mousedown', this.onCanvasMouseDown.bind(this))
	document.addEventListener('mouseup', this.onCanvasMouseUp.bind(this))

	var wasPlayingOnBlur = true
	document.addEventListener('visibilitychange', function() {
		if (!document.hidden && wasPlayingOnBlur) {
			that.player.play()
		} else {
			wasPlayingOnBlur = that.player.state.PLAYING === that.player.current_state
			that.player.pause()
		}

		E2.app.changeControlState()
	})

	window.addEventListener('blur', function() {
		that.clearEditState()
	})

	document.addEventListener('fullscreenchange', this.onFullScreenChanged.bind(this))
	document.addEventListener('webkitfullscreenchange', this.onFullScreenChanged.bind(this))
	document.addEventListener('mozfullscreenchange', this.onFullScreenChanged.bind(this))

	window.addEventListener('resize', function() {
		// To avoid UI lag, we don't respond to window resize events directly.
		// Instead, we set up a timer that gets superceeded for each (spurious)
		// resize event within a 200 ms window.
		clearTimeout(that.resize_timer)
		that.resize_timer = setTimeout(that.onWindowResize.bind(that), 200)
	})

	// close bootboxes on click
	$(document).on('click', '.bootbox.modal.in', function(e) {
		var $et = $(e.target)
		if (!$et.parents('.modal-dialog').length)
			bootbox.hideAll()
	})

	E2.dom.worldEditorButton.click(function() {
		E2.app.toggleWorldEditor()
	});

	E2.dom.publishButton.click(function() {
		E2.app.onPublishClicked()
	});

	$('button#fullscreen').click(function() {
		E2.app.toggleFullscreen()
	});

	$('button#help').click(function() {
		window.open('/help/introduction.html', 'Vizor Help');
	});

	$('.resize-handle').on('mousedown', function(e) {
		var $handle = $(this)
		var $target = $(this).parent()
		var oh = $target.height()
		var oy = e.pageY
		var $doc = $(document)
		var changed = false

		e.preventDefault()

		function mouseMoveHandler(e) {
			changed = true
			var nh = oh + (e.pageY - oy)
			e.preventDefault()
			$target.css('height', nh+'px')
			if ($target.hasClass('chat-users')) {
				if (E2.ui)
					E2.ui.onChatResize();
			}
		}

		$doc.on('mousemove', mouseMoveHandler)
		$doc.one('mouseup', function(e) {
			e.preventDefault()
			$doc.off('mousemove', mouseMoveHandler)
		})
	});

	E2.dom.viewSourceButton.click(E2.ui.viewSource);

	E2.dom.saveACopy.click(E2.app.onSaveACopyClicked.bind(E2.app))
	E2.dom.saveAsPreset.click(E2.app.onSaveAsPresetClicked.bind(E2.app))
	E2.dom.saveSelectionAsPreset.click(E2.app.onSaveSelectionAsPresetClicked.bind(E2.app))
	E2.dom.open.click(E2.app.onOpenClicked.bind(E2.app))
	E2.dom.btnNew.click(E2.app.onNewClicked.bind(E2.app))
	E2.dom.forkButton.click(E2.app.onForkClicked.bind(E2.app))


	E2.dom.play.click(E2.app.onPlayClicked.bind(E2.app))
	E2.dom.pause.click(E2.app.onPauseClicked.bind(E2.app))
	E2.dom.stop.click(E2.app.onStopClicked.bind(E2.app))

	this.midPane = new E2.MidPane()

	E2.ui.updateProgressBar(100);

	E2.app.player.play() // autoplay
	E2.app.changeControlState()


	E2.ui.showFirstTimeDialog();
	
	$('[data-toggle="popover"]').popover({
			container: 'body',
			trigger: 'hover',
			animation: false
	});
	
	$(document).on("shown.bs.modal", function() {
		$('.bootbox-close-button').html('<svg class="icon-dialog-close">'
									  + '<use xlink:href="#icon-close"></use></svg>')
								  .attr('style','');
	});
}


/**
 * Called when Core has been initialized
 * Initializes the Editor Stores and model layer events
 * Then starts the UI layer
 */
Application.prototype.onCoreReady = function(loadGraphUrl) {
	var that = this

	E2.ui.init(E2);
	this.presetManager = new PresetManager('/presets')

	that.setupPeopleEvents()
	that.setupStoreListeners()

	function start() {
		E2.dom.canvas_parent.toggle(that.noodlesVisible)
		
		E2.app.start()

		E2.app.onWindowResize()

		if (E2.core.pluginManager.release_mode) {
			window.onbeforeunload = function() {
				return "You might be leaving behind unsaved work. Are you sure you want to close the editor?";
			}
		}
	}

	if (!loadGraphUrl && !boot.hasEdits) {
		loadGraphUrl = '/data/graphs/default.json'
		E2.app.snapshotPending = true
	}

	if (loadGraphUrl)
		E2.app.loadGraph(loadGraphUrl, start)
	else
		E2.app.setupEditorChannel().then(start)
	
}

Application.prototype.setupChat = function() {
	if (this.chat)
		return

	this.chatStore = new E2.ChatStore()
	this.chat = new E2.Chat($('#chat'))
}

/**
 * Connect to the EditorChannel for this document
 */
Application.prototype.setupEditorChannel = function() {
	var dfd = when.defer()
	var that = this

	function joinChannel() {
		if (isUserOwnedGraph(that.path)) {
			that.channel.leave()
			return dfd.resolve()
		}

		that.channel.join(that.path, function() {
			dfd.resolve()
		})
	}

	var wsHost
	
	if (!E2.core.pluginManager.release_mode) {
		// dev mode
		wsHost = window.location.hostname
	}
	else {
		// release mode
		wsHost = "ws." + window.location.hostname
	}

	var wsPort = window.location.port || 80

	if (!this.channel) {
		this.channel = new E2.EditorChannel()
		this.channel.connect(wsHost, wsPort)
		this.channel.on('ready', function() { 
			that.setupChat()
			that.peopleStore.initialize()
			joinChannel()
		})
	} else 
		joinChannel()

	E2.ui.setPageTitle();
	
	return dfd.promise
}

E2.InitialiseEngi = function(vr_devices, loadGraphUrl) {
	E2.dom.editorHeader = $('.editor-header');

	E2.dom.progressBar = $('#progressbar');
	
	E2.dom.btnNew = $('#btn-new');
	
	E2.dom.btnScale = $('#btn-scale');
	E2.dom.btnRotate = $('#btn-rotate');
	E2.dom.btnAssets = $('#btn-assets');
	
	E2.dom.btnInspector = $('#btn-inspector');
	E2.dom.btnPresets = $('#btn-presets');
	E2.dom.btnSavePatch = $('#btn-save-patch');
	
	E2.dom.btnGraph = $('#btn-graph');
	E2.dom.btnEditor = $('#btn-editor');
	E2.dom.btnZoomOut = $('#btn-zoom-out');
	E2.dom.btnZoom = $('#btn-zoom');
	E2.dom.btnZoomIn = $('#btn-zoom-in');
	E2.dom.zoomDisplay = $('#current-zoom');
	E2.dom.btnChatDisplay = $('#btn-chat-display');
	
	E2.dom.btnSignIn = $('#btn-sign-in');
	E2.dom.btnAccountMenu = $('#btn-account-top');
	E2.dom.userPullDown = $('#userPullDown');
	
	E2.dom.breadcrumb = $('#breadcrumb');
	
	E2.dom.uiLayer = $('#ui-layer');
	
	E2.dom.assetsLib = $('#assets-lib');
	E2.dom.assetsToggle = $('#assets-toggle');
	E2.dom.assetsClose = $('#assets-close');
	
	E2.dom.presetsLib = $('#presets-lib');
	E2.dom.presets_list = $('#presets');
	
	E2.dom.canvas_parent = $('#canvas_parent');
	E2.dom.canvas = $('#canvas');
	E2.dom.controls = $('#controls');
	E2.dom.webgl_canvas = $('#webgl-canvas');
	
	E2.dom.chatWindow = $('#chat-window');
	E2.dom.chatTabs = $('#chat-window>.chat-tabs');
	E2.dom.chatToggleButton = $('#chat-toggle');
	E2.dom.chatClose = $('#chat-close');
	E2.dom.chatTabBtn = $('#chatTabBtn');
	E2.dom.peopleTabBtn = $('#peopleTabBtn');
	E2.dom.chatTab = $('#chatTab');
	E2.dom.chat = $('#chat');
	
	E2.dom.peopleTab = $('#peopleTab');
	E2.dom.presetsToggle = $('#presets-toggle');
	E2.dom.presetsClose = $('#presets-close');
	
	E2.dom.dbg = $('#dbg');
	E2.dom.worldEditorButton = $('#worldEditor');
	E2.dom.publishButton = $('#publish-button');
	E2.dom.play = $('#play');
	E2.dom.play_i = $('i', E2.dom.play);
	E2.dom.pause = $('#pause');
	E2.dom.stop = $('#stop');
	E2.dom.refresh = $('#refresh');
	E2.dom.forkButton = $('#fork-button');
	E2.dom.viewSourceButton = $('#view-source');
	E2.dom.saveACopy = $('.save-copy-button');
	E2.dom.saveAsPreset = $('#save-as-preset');
	E2.dom.saveSelectionAsPreset = $('#save-selection-as-preset');
	E2.dom.dl_graph = $('#dl-graph');
	E2.dom.open = $('#open');
	E2.dom.structure = $('#structure');
	E2.dom.info = $('#info');
	E2.dom.info._defaultContent = E2.dom.info.html()
	E2.dom.tabs = $('#tabs');
	E2.dom.graphs_list = $('#graphs-list');
	E2.dom.filename_input = $('#filename-input');
	
	E2.dom.bottomBar = $('.bottom-panel');
	
	E2.dom.btnTimeline = $('#btn-timeline');
	
	E2.dom.play = $('#play');
	E2.dom.playPauseIcon = $('#play use');
	E2.dom.pause = $('#pause');
	E2.dom.stop = $('#stop');
	E2.dom.fscreen = $('#fullscreen');
	E2.dom.vrview = $('#vrview');
	
	E2.dom.btnVRCam = $('#btn-vrcam');
	E2.dom.btnEditorCam = $('#btn-editorcam');

	$.ajaxSetup({ cache: false });

	E2.dom.dbg.ajaxError(function(e, jqxhr, settings, ex) {
		if (settings.dataType === 'script') {
			if (typeof(ex) === 'string') {
				msg(ex);
				return;
			}

			var m = 'ERROR: Script exception:\n';

			if(ex.fileName)
				m += '\tFilename: ' + ex.fileName;

			if(ex.lineNumber)
				m += '\tLine number: ' + ex.lineNumber;

			if(ex.message)
				m += '\tMessage: ' + ex.message;

			msg(m)
		}
	})

	E2.core = new Core(vr_devices)
	E2.app = new Application()
	E2.ui = new VizorUI();

	var player = new Player(vr_devices, E2.dom.webgl_canvas)

	E2.treeView = E2.dom.structure.tree = new TreeView(
		E2.dom.structure,
		E2.core.root_graph,
		function() { // On item activation
			E2.app.clearEditState()
			E2.app.clearSelection()
		},
		// on graph reorder
		E2.app.graphApi.reorder.bind(E2.app.graphApi)
	)

	E2.app.player = player

	// Shared gl context for three
	var gl_attributes = {
		alpha: false,
		depth: true,
		stencil: true,
		antialias: false,
		premultipliedAlpha: true,
		preserveDrawingBuffer: false
	}

	E2.app.worldEditor = new WorldEditor()


	E2.core.glContext = E2.dom.webgl_canvas[0].getContext('webgl', gl_attributes) || E2.dom.webgl_canvas[0].getContext('experimental-webgl', gl_attributes)
	E2.core.renderer = new THREE.WebGLRenderer({context: E2.core.glContext, canvas: E2.dom.webgl_canvas[0]})

	E2.core.on('ready', E2.app.onCoreReady.bind(E2.app, loadGraphUrl))
}

if (typeof(module) !== 'undefined')
	module.exports = Application

})()

