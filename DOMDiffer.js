$(function() {

	//turn dom nodes into vnodes and diff
	function diffNodes(source, destination) {
		var vsource = nodeToVNode(source);
		var vdestination = nodeToVNode(destination);
		return diffVNodes(vsource, vdestination);
	}

	//turn don node into vnode
	function nodeToVNode(node, options) {
		options = options || {
			depth: 0,
			index: 0,
			uid: 0,
			parentUid: -1
		};
		var depth = options.depth;
		var index = options.index;
		var vNode = {
			node: node,
			nodeType: node.nodeType,
			nodeName: node.nodeName,
			attributes: {},
			id: false,
			classes: {},
			childNodes: [],
			depth: depth,
			index: index,
			deep: 0,
			uid: options.uid++,
			parentUid: options.parentUid
		};
		var nodeAttribtes = node.attributes;
		var vNodeAttributes = vNode.attributes;
		for (var i = 0, l = nodeAttribtes.length; i < l; i++) {
			var attribute = nodeAttribtes.item(i);
			if (attribute.name === "class") continue;
			if (attribute.name === "id") {
				vNode.id = attribute.value;
				continue;
			}
			vNodeAttributes[attribute.name] = attribute.value;
		}
		var vNodeClasses = vNode.classes;
		if (vNodeAttributes['class']) {
			var strings = vNodeAttributes['class'].split(" ");
			for (var i = 0, l = strings.length; i < l; i++) {
				vNodeClasses[strings[i]] = true;
			}
		}
		var deep = 1;
		for (var i = 0, l = node.childNodes.length; i < l; i++) {
			var childNode = node.childNodes[i];
			var vChildNodes = vNode.childNodes;
			var childNodeType = childNode.nodeType;
			switch (childNodeType) {
			case 1:
				var childOptions = {
					depth: depth+1, 
					index: i,
					uid: options.uid, // carry current uid count through
					parentUid: vNode.uid
				};
				var vChildNode = nodeToVNode(childNode, childOptions);
				deep = deep+vChildNode.deep;
				options.uid = childOptions.uid;
				break;
			case 3:
				vChildNode = {
					node: childNode,
					nodeType: childNodeType,
					nodeName: childNode.nodeName,
					data: childNode.data,
					trimmed: trim(childNode.data),
					index: i,
					depth: depth+1,
					deep: 0,
					uid: options.uid++,
					parentUid: vNode.uid
				};
				break;
			}
			vChildNodes.push(vChildNode);
		}
		vNode.deep = deep;
		return vNode;
	}

	//trim whitespace from a string ends
	function trim(string) {
		return string.replace(trim.regex, '');
	}
	trim.regex = /^\s+|\s+$/g;

	//flatten vnodes and diff
	function diffVNodes(vsource, vdestination) {
		var fVSource = flattenVNode(vsource);
		var fVDestination = flattenVNode(vdestination);
		return diffFlatVNodes(fVSource, fVDestination);
	}

	//flatten a vnode
	function flattenVNode(vNode, rtn) {
		rtn = rtn || [];
		switch (vNode.nodeType) {
		case 1:
			rtn.push(vNode);
			for (var i = 0, l = vNode.childNodes.length; i < l; i++) {
				flattenVNode(vNode.childNodes[i], rtn);
			}
			break;
		case 3:
			rtn.push(vNode);
			break;
		}
		return rtn;
	}

	//create a differential of flattened vnodes
	//1. match source and destination nodes as best possible, at 100%, 80%, 60%, 40% and 20%
	//2. create matches to remove all left-over source nodes with no matches
	//3. create matches to add all left-over destination nodes
	//4. index each match by it's source and destination
	//5. expand the differences between each match
	//6. find the start source node
	//7. rebuild destination tree from source tree using added nodes where necessary and returning the order of the differences
	//8. use the differential to turn a copy of the source tree into the destination tree, removing redundant diffs on the way
	//9. return finished differential
	function diffFlatVNodes(fVSource, fVDestination) {

		//create editable arrays to preserve original arrays
		var fVSource2 = fVSource.slice(0);
		var fVDestination2 = fVDestination.slice(0);

		//try to match containers
		var sourceMatches = [];
		compareAndRemoveFVNodes(fVSource2, fVDestination2, 1, sourceMatches);
		compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.80, sourceMatches);
		compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.60, sourceMatches);
		compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.40, sourceMatches);
		compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.20, sourceMatches);

		var removes = createRemoveMatches(fVSource2, sourceMatches);
		var adds = createAddMatches(fVDestination2, sourceMatches);

		var uidIndexes = makeUidIndexes(sourceMatches);

		expandMatchDifferences(sourceMatches, uidIndexes);

		var destinationStartVNode = findFVStartNode(fVDestination);
		var orderedMatches = rebuildDestinationFromSourceMatches(destinationStartVNode, sourceMatches);

		var differential = [].concat(
			removes, //re-add removes as they get lost in the ordering
			orderedMatches
		)

		//find the start node on the original source
		var sourceStartVNode = findFVStartNode(fVSource);
		
		//remove redundant differentials by applying the diff
		//use cloneSourceVNode so as not to change the original source vnode
		vNodeApplyDiff(sourceStartVNode, differential, {
			cloneSourceVNode: true
		});

		return differential;
	};

	//compare each source vnode with each destination vnode
	//when a match is found, remove both the source and destination from their original flattened arrays and add a match diff object
	function compareAndRemoveFVNodes(fVSource, fVDestination, minRate, sourceMatches) {
		if (fVSource.length === 0 || fVDestination.length === 0) return;

		var fIndex = fVSource.length-1;
		var f2Index = fVDestination.length-1;

		var maxRating = -1, maxRated, maxRatedF2Index, rated = [];
		while (fIndex >= 0) {

			var source = fVSource[fIndex];
			var destination = fVDestination[f2Index];

			var rate = rateCompare(destination, source);

			if (rate > maxRating && rate >= minRate) {
				maxRated = destination;
				maxRating = rate;
				maxRatedF2Index = f2Index;
				rated.push(destination);
				if (rate >= minRate && minRate >= 0.8) {
					if (maxRated !== undefined) {
						fVSource.splice(fIndex, 1);
						fVDestination.splice(maxRatedF2Index, 1);
						diffObj = {
							source: source,
							destination: destination,
							nodeType: source.nodeType,
							sourceUid: source.uid,
							sourceParentUid: source.parentUid,
							destinationUid: maxRated.uid,
							destinationParentUid: maxRated.parentUid,
							depth: maxRated.depth,
							equal: rate === 1
						};
						sourceMatches.push(diffObj);
					}
					maxRating = 0;
					maxRated = undefined;
					maxRatedF2Index = undefined;
					rated.length = 0;
					fIndex--;
					f2Index = fVDestination.length-1;
					continue;
				}
			}
			
			f2Index--;
			if (f2Index === -1) {
				if (maxRated !== undefined) {
					fVSource.splice(fIndex, 1);
					fVDestination.splice(maxRatedF2Index, 1);
					diffObj = {
						source: source,
						destination: destination,
						nodeType: source.nodeType,
						sourceUid: source.uid,
						sourceParentUid: source.parentUid,
						destinationUid: maxRated.uid,
						destinationParentUid: maxRated.parentUid,
						depth: maxRated.depth,
						equal: false
					};
					sourceMatches.push(diffObj);
				}
				maxRating = 0;
				maxRated = undefined;
				maxRatedF2Index = undefined;
				fIndex--;
				f2Index = fVDestination.length-1;
				continue;
			}

		}
	}

	//create a percentage difference value for two vnodes
	//10% for matching nodenames
	//20% for matching ids
	//20% for matching attributes
	//20% for matching classes
	//10% if both have children
	//10% if both have the same number of nodes deep
	//10% if both are at the same depth
	function rateCompare(vdestination, vsource) {
		var value = 0;
		if (vdestination.nodeType !== vsource.nodeType) return -1;

		//console.log(vsource.uid, vdestination.uid);

		switch (vdestination.nodeType) {
		case 1:
			
			value+=vsource.id===vdestination.id?3:0;
			value+=vsource.depth === vdestination.depth ? 3 : 0;

			value+=keyValueCompare(vsource.attributes, vdestination.attributes) * 2;
			value+=keyValueCompare(vsource.classes, vdestination.classes) * 2;

			value+=vsource.nodeName === vdestination.nodeName?1:0;

			value+=vsource.childNodes.length !== 0 && vdestination.childNodes.length !== 0 ? 1 : 0;
			value+=vsource.childNodes.length === vdestination.childNodes.length ? 1 : 0;
			
			value+=vsource.deep === vdestination.deep ? 1 : 0;
			value+=vsource.index === vdestination.index ? 1 : 0;

			return (value / 15) || -1;
		case 3:
			value+=vsource.trimmed === vdestination.trimmed ? 2 : 0;
			value+=vsource.data === vdestination.data ? 1 : 0;
			return (value / 3) || -1;
		}
	}

	//compare two key value pair objects
	//return percentage match 0-1
	function keyValueCompare(object1, object2) {
		var matchingValues = 0;
		var totalKeys = 0;
		for (var k1 in object1) {
			totalKeys++;
			if (object2.hasOwnProperty(k1)) {
				if (object2[k1] === object2[k1]) {
					matchingValues++;
				}
			}
		}
		for (var k2 in object2) {
			if (!object1.hasOwnProperty(k2)) {
				totalKeys++;
			}
		}
		if (totalKeys === 0) return 1;
		return (matchingValues / totalKeys) || -1;
	}

	//manufacture 'matches' for the items to remove from the source tree
	function createRemoveMatches(fVSource2, sourceMatches) {
		var removes = [];
		for (var i = 0, l = fVSource2.length; i < l; i++) {
			var source = fVSource2[i];
			var diffObj = {
				remove: true,
				source: source,
				nodeType: source.nodeType,
				sourceUid: source.uid,
				sourceParentUid: source.parentUid,
				depth: source.depth
			};
			sourceMatches.push(diffObj);
			removes.push(diffObj);
		}
		return removes;
	}

	//manufacture 'matches' for the items to add to the source tree from the destination
	function createAddMatches(fVDestination2, sourceMatches) {
		if (fVDestination2.length === 0) return;
		//create new source pieces to add by cloning the needed destination pieces

		var newDestinationRoots = [];
		var destinationParentUids = {};
		for (var f2Index = 0, l = fVDestination2.length; f2Index < l; f2Index++) {

			var destination = fVDestination2[f2Index];
			destinationParentUids[destination.uid] = true;
			if (!destinationParentUids[destination.parentUid]) {
				newDestinationRoots.push(destination);
			}

		}
		fVDestination2.splice(0, fVDestination2.length)[0];

		//create matches for new objects to that sourceUids don't conflict with preexisting sourceNodes
		//assign new item.sourceUids from the negative spectrum
		var addMatches = [];
		var newSourceUids = -1;
		var translateOldUidToNew = {};
		for (var i = 0, l = newDestinationRoots.length; i < l; i++) {
			var fVSource = flattenVNode(clone(newDestinationRoots[i], {"node": true})); //clone for new source nodes
			var fVDestination = flattenVNode(newDestinationRoots[i]);
			for (var c = 0, cl = fVDestination.length; c < cl; c++) {
				var destination = fVDestination[c];
				var source = vNodeToOuterVNode(fVSource[c]);

				var oldSourceUid = destination.uid;
				var newSourceUid = newSourceUids--;
				translateOldUidToNew[oldSourceUid] = newSourceUid;

				var newSourceParentUid = destination.parentUid;
				if (translateOldUidToNew[newSourceParentUid] !== undefined) {
					//if no translation to a new uid, assume new node is connected to a preexisting source node
					//otherwise we're dealing with a child of a new root
					newSourceParentUid = translateOldUidToNew[newSourceParentUid]
				}

				//configure new source nodes
				source.uid = newSourceUid;
				source.parentUid = newSourceParentUid;
				source.node = undefined; //remove destination node from the diff

				var diffObj = {
					add: true,
					destination: destination,
					nodeType: destination.nodeType,
					destinationUid: destination.uid,
					destinationParentUid: destination.parentUid,
					depth: destination.depth,
					relocateIndex: destination.index,
					siblings: true,
					source: source,
					sourceUid: newSourceUid,
					sourceParentUid: newSourceParentUid
				}

				sourceMatches.push(diffObj);
				addMatches.push(diffObj);
			}
		}

		return addMatches;
	}

	//index all of the match nodes by their source and destination uids
	function makeUidIndexes(sourceMatches) {
		var uidIndexes = {
			bySourceUid: {},
			byDestinationUid: {}
		};
		for (var i = 0, l = sourceMatches.length; i < l; i++) {
			var diff = sourceMatches[i];
			if (diff.sourceUid !== undefined) {
				uidIndexes.bySourceUid[diff.sourceUid] = diff;
			}
			if (diff.destinationUid !== undefined) {
				uidIndexes.byDestinationUid[diff.destinationUid] = diff;
			}
			if (diff.add) {
				diff.sourceParentUid = uidIndexes.byDestinationUid[diff.destination.parentUid].sourceUid;
			}
		}
		return uidIndexes;
	}

	//iterate through all of the matches
	function expandMatchDifferences(sourceMatches, uidIndexes) {
		for (var i = 0, l = sourceMatches.length; i < l; i++) {
			var diff = sourceMatches[i];
			expandDifferences(diff, uidIndexes);
		}
	}

	//add attributes to the match to express the differences between each pair
	//this makes each match-pair into a match-diff
	function expandDifferences(match, uidIndexes) {

		if (match.equal || match.remove || match.add) return;

		var source = match.source;
		var destination = match.destination;

		switch(match.nodeType) {
		case 1:
			if (source.nodeName !== destination.nodeName) match.nodeName = destination.nodeName;
			match.attributes = diffKeys(source.attributes, destination.attributes);
			match.classes = diffKeys(source.classes, destination.classes);
			if (source.id !== destination.id) match.id = destination.id;

			if (match.destinationParentUid === -1) break;

			var relocateParentUid = uidIndexes.byDestinationUid[match.destinationParentUid].sourceUid;
			if (relocateParentUid !== match.sourceParentUid) {
				match.relocateParentUid = relocateParentUid;
				match.hierarchy = true;
			} else if (source.index !== destination.index) {
				match.relocateIndex =  destination.index;
				match.siblings = true;
			}

			break;
		case 3:
			if (source.data !== destination.data) match.data = destination.data;
			break;
		}

	}

	//describe the differences between two objects (source & destination attributes, or source & destination classes)
	function diffKeys (source, destination) {
		var diff = {
			removed: [],
			addedLength: 0,
			added: {},
			changedLength: 0,
			changed: {},
			isEqual: true,
		};
		for (var k in source) {
			var exists = destination.hasOwnProperty(k);
			if (!exists) {
				diff.removed.push(k);
				continue;
			} 

			var value = source[k];
			var nodeValue = destination[k];
			if (value !== nodeValue) {
				diff.changed[k] = nodeValue;
				diff.changedLength++;
			}
		}
		for (var k in destination) {
			var exists = source.hasOwnProperty(k);
			if (!exists) {
				var nodeValue = destination[k];
				diff.added[k] = nodeValue;
				diff.addedLength++;
			}
		}
		if (diff.removed.length > 0 || diff.addedLength > 0 || diff.changedLength > 0) {
			diff.isEqual = false;
		}
		return diff;
	};

	//find the first vnode in a flattened vnode list
	function findFVStartNode(fVNode) {
		var startVNode;
		for (var i = 0, l = fVNode.length; i < l; i++) {
			if (fVNode[i].parentUid === -1) {
				startVNode = fVNode[i];
				break;
			}
		}
		if (!startVNode) throw "cannot find start node";
		return startVNode;
	}

	//recursively go through the destination tree, checking each source mapped node (or added node) and outputing the match-diffs where necessary
	//this filters and orders the match-diffs creating a preliminary differential
	function rebuildDestinationFromSourceMatches(startVNode, sourceMatches, uidIndexes, parentVNode, newIndex) {
		if (!uidIndexes) {
			uidIndexes = {
				bySourceUid: {},
				byDestinationUid: {}
			};
			for (var i = 0, l = sourceMatches.length; i < l; i++) {
				var diff = sourceMatches[i];
				if (diff.sourceUid !== undefined) {
					uidIndexes.bySourceUid[diff.sourceUid] = diff;
				}
				if (diff.destinationUid !== undefined) {
					uidIndexes.byDestinationUid[diff.destinationUid] = diff;
				}
			}
		};

		var diffs = [];
		var diff = uidIndexes.byDestinationUid[startVNode.uid];

		//check if equal but should be in a different parent
		if (diff.equal && parentVNode !== undefined
			&& uidIndexes.bySourceUid[diff.sourceParentUid] 
			&& uidIndexes.bySourceUid[diff.sourceParentUid].destinationUid !== parentVNode.uid 
			) {
			var modeToSourceUid = uidIndexes.byDestinationUid[parentVNode.uid].sourceUid;
			//mark to move into a different parent
			diff.equal = false;
			diff.hierarchy = true;
			//fetch source parent to relocate node to
			diff.relocateParentUid = modeToSourceUid;
		}

		//check if should relocate to a different index
		if (newIndex !== undefined
			&& diff.source.index !== newIndex) {

			diff.equal = false;
			diff.siblings = true;
			diff.relocateIndex = newIndex;
		}

		switch (diff.nodeType) {
		case 1:
			if (!diff.equal
				&& (diff.add
				|| diff.id
				|| diff.nodeName
				|| (diff.attributes && !diff.attributes.isEqual)
				|| (diff.classes && !diff.classes.isEqual)
				|| diff.hierarchy
				|| diff.siblings
				)) {
				diffs.push(diff);
			}
			for (var i = 0, l = startVNode.childNodes.length; i < l; i++) {
				var childNode = startVNode.childNodes[i];
				diffs = diffs.concat(rebuildDestinationFromSourceMatches(childNode, sourceMatches, uidIndexes, startVNode, i));
			}
			break;
		case 3:
			if (!diff.equal
				&& (diff.data
				|| diff.add
				|| diff.hierarchy
				|| diff.siblings
				)) {
				diffs.push(diff);
			}
			break;
		}

		return diffs;

	}

	//apply the differential to the vnode, optionally cloning the vnode so as not to change it
	function vNodeApplyDiff(startVNode, differential, options) {

		options = options || {
			cloneSourceVNode: false,
			performOnDOM: false
		};

		if (options.cloneSourceVNode) startVNode = clone(startVNode, {node:true});

		var fVStartNode = flattenVNode(startVNode);
		var differential2 = clone(differential, {node:true});

		var bySourceUid = {};
		for (var i = 0, l = fVStartNode.length; i < l; i++) {
			if (bySourceUid[fVStartNode[i].uid]) {
				throw "duplicate uid in differential";
			}
			bySourceUid[fVStartNode[i].uid] = fVStartNode[i];
		}

		for (var i = 0, l = differential2.length; i < l; i++) {
			var diff = differential2[i];
			var vNode = bySourceUid[diff.sourceUid];

			if (diff.remove) {
				var parent = bySourceUid[diff.sourceParentUid];
				if (parent.nodeType === 3) throw "cannot find children of a text node";

				var found = false;
				for (var r = 0, rl = parent.childNodes.length; r < rl; r++) {
					if ( parent.childNodes[r].uid === diff.sourceUid) {

						if (options.performOnDOM) {
							parent.node.removeChild(vNode.node);
						}

						parent.childNodes.splice(r,1);
						found = true;
						break;
					}
				}
				if (!found) throw "Remove not found";

				diff.complete = true;
				continue;
			}

			if (diff.add) {
				var parent = bySourceUid[diff.sourceParentUid];
				//index the new diff by source id so that subsequent child adds have somewhere to go
				bySourceUid[diff.sourceUid] = diff.source;

				if (options.performOnDOM) {
					//create a new node for the ouput
					var node = vNodeToNode(diff.source);
					//assign the new node to the diff otherwise subsequent children will add to the previous destination as a parent
					diff.source.node = node;
					parent.node.insertBefore(node, parent.node.childNodes[diff.siblings]);
				}

				parent.childNodes.splice(diff.siblings,0, diff.source);

				diff.complete = true;
				continue;
			}
			
			//change attributes
			if (diff.attributes) {
				var attributes = diff.attributes;
				if (attributes.removed.length > 0) {
					for (var r = 0, rl = attributes.removed.length; r < rl; r++) {

						if (options.performOnDOM) {
							vNode.node.removeAttribute(k);
						}

						delete vNode.attributes[k];
					}
				}
				if (attributes.changedLength > 0) {
					for (var k in attributes.changed) {

						if (options.performOnDOM) {
							vNode.node.setAttribute(k, attributes.changed[k]);
						}

						vNode.attributes[k] = attributes.changed[k];
					}
				}
				if (attributes.addedLength > 0) {
					for (var k in attributes.added) {

						if (options.performOnDOM) {
							vNode.node.setAttribute(k, attributes.added[k]);
						}

						vNode.attributes[k] = attributes.added[k];
					}
				}
				diff.complete = true;
			}

			if (diff.id) {
				if (options.performOnDOM) {
					vNode.node.setAttribute('id', vNode.id);
				}
				vNode.id = diff.id;
				diff.complete = true;
			}

			//change classes
			if (diff.classes) {
				var classes = diff.classes;
				if (classes.removed.length > 0) {
					for (var r = 0, rl = classes.removed.length; r < rl; r++) {
						delete vNode.classes[k];
					}
				}
				if (classes.changedLength > 0) {
					for (var k in classes.changed) {
						vNode.classes[k] = classes.changed[k];
					}
				}
				if (classes.addedLength > 0) {
					for (var k in classes.added) {
						vNode.classes[k] = classes.added[k];
					}
				}

				if (options.performOnDOM) {
					if (!classes.isEqual) {
						var classNames = [];
						for (var k in vNode.classes) {
							classNames.push(k);
						}
						vNode.node.setAttribute(attr, classNames.join(" "));
					}
				}

				diff.complete = true;
			}

			//change data
			if (diff.data !== false && diff.data !== undefined) {

				if (options.performOnDOM) {
					vNode.node.data = diff.data;
				}

				vNode.data = diff.data;
				diff.complete = true;
			}

			//change nodeName
			if (diff.nodeName !== false && diff.nodeName !== undefined) {

				if (options.performOnDOM) {
					//create a new node, add the attributes
					var parentNode = bySourceUid[diff.sourceParentUid].node;
					var newNode = document.createElement(diff.nodeName);
					for (var k in vNode.attributes) {
						newNode.setAttribute(k, vNode.attributes);
					}
					var classNames = [];
					for (var k in vNode.classes) {
						classNames.push(k);
					}
					newNode.setAttribute('class', classNames.join(" "));
					newNode.setAttribute('id', vNode.id);

					//move all the children from old node to new node
					replaceNodeChildren(newNode, vNode.node);

					//replace diff node and dom node so that subsequent children have the right location
					parentNode.replaceChild(newNode, vNode.node);
					vNode.node = newNode;
				}

				vNode.nodeName = diff.nodeName;
				diff.complete = true;
			}

			if (diff.hierarchy) {
				var oldParent = bySourceUid[diff.sourceParentUid];
				var newParent = bySourceUid[diff.relocateParentUid];

				//remove from original source childNodes
				var found = false;
				var modeNode;
				for (var r = 0, rl = oldParent.childNodes.length; r < rl; r++) {
					if ( oldParent.childNodes[r].uid === diff.sourceUid) {

						if (options.performOnDOM) {
							moveNode = oldParent.node.childNodes[r];
						}

						oldParent.childNodes.splice(r, 1);
						found = true;
						break;
					}
				}
				if (!found) {
					throw "cannot find object to move in parent";
				}

				//add to final source childNode
				found = false;
				if (vNode.index === newParent.childNodes.length) {
					if (options.performOnDOM) {
						newParent.node.appendChild(moveNode);
					}
					newParent.childNodes.push(vNode);
				} else {
					for (var r = 0, rl = newParent.childNodes.length; r < rl; r++) {
						if ( r === vNode.index ) {
							if (options.performOnDOM) {
								newParent.node.insertBefore(moveNode, newParent.node.childNodes[r]);
							}
							newParent.childNodes.splice(r, 0, vNode);
							found = true;
							break;
						}
					}
					if (!found) {
						throw "cannot find object to move in parent";
					}
				}

				diff.complete = true;

			}

			if (!diff.add && diff.siblings) {
				var parent = bySourceUid[diff.sourceParentUid];
				for (var r = 0, rl = parent.childNodes.length; r < rl; r++) {
					parent.childNodes[r].index = r;
				}

				if (diff.relocateIndex === vNode.index) {
					diff.redundant = true;
				} else {

					var afterNode = parent.node.childNodes[diff.relocateIndex];
					var moveNode = parent.node.childNodes[vNode.index];
					parent.node.insertBefore(moveNode, afterNode);

					parent.childNodes.splice(vNode.index,1);
					parent.childNodes.splice(diff.relocateIndex,0,vNode);
				}

				diff.complete = true;
			}

		}

		//remove redundant items from the original diff
		for (var i = differential2.length-1, l = -1; i > l; i--) {
			var diff = differential2[i];
			if (diff.redundant) {
				differential.splice(i,1);
			}
		}

		return startVNode;
	}

	//clone basic javascript Array, Object and primative structures
	function clone(value, copy) {
		if (typeof value === "object") {
			if (value instanceof Array) {
				var rtn = [];
				for (var i = 0, l = value.length; i < l; i++) {
					rtn[i] = clone(value[i], copy);
				}
				return rtn;
			}
			var rtn = {};
			for (var k in value) {
				if (copy && copy[k]) {
					rtn[k] = value[k]
				} else {
					rtn[k] = clone(value[k], copy);
				}
			}
			return rtn;
		}
		return value;
	}

	function vNodeToOuterVNode(vNode) {
		switch (vNode.nodeType) {
		case 1:
			vNode.childNodes.length = 0;
		}
		return vNode;
	}

	//render a node into a dom node
	function vNodeToNode(vNode) {

		var node;
		switch (vNode.nodeType) {
		case 1:
			node = document.createElement(vNode.nodeName);
			for (var k in vNode.attributes) {
				var attr = document.createAttribute(k);
				attr.value = vNode.attributes[k];
				node.attributes.setNamedItem(attr);
			}
			var classes = [];
			for (var k in vNode.classes) {
				classes.push(k);			
			}
			var className = classes.join(" ");
			if (className) {
				var attr = document.createAttribute("class");
				attr.value = className;
				node.attributes.setNamedItem(attr);
			}
			if (vNode.id) {
				var attr = document.createAttribute("id");
				attr.value = vNode.id;
				node.attributes.setNamedItem(attr);
			}
			for (var i = 0, l = vNode.childNodes.length; i < l; i++) {
				node.appendChild( vNodeToNode(vNode.childNodes[i]) );
			}
			break;
		case 3:
			node = document.createTextNode(vNode.data);
			break;
		}

		return node;
	}

	function vNodeToOuterNode(vnode) {
		var node;
		switch (vNode.nodeType) {
		case 1:
			node = document.createElement(vNode.nodeName);
			for (var k in vNode.attributes) {
				var attr = document.createAttribute(k);
				attr.value = vNode.attributes[k];
				node.attributes.setNamedItem(attr);
			}
			var classes = [];
			for (var k in vNode.classes) {
				classes.push(k);			
			}
			var className = classes.join(" ");
			if (className) {
				var attr = document.createAttribute("class");
				attr.value = className;
				node.attributes.setNamedItem(attr);
			}
			if (vNode.id) {
				var attr = document.createAttribute("id");
				attr.value = vNode.id;
				node.attributes.setNamedItem(attr);
			}
			break;
		case 3:
			node = document.createTextNode(vNode.data);
			break;
		}

		return node;
	}

	function nodeApplyDiff(node, differential) {
		//TODO
		var startVNode = nodeToVNode(node);

		vNodeApplyDiff(startVNode, differential, {
			cloneSourceVNode: false,
			performOnDOM: true
		});

		return startVNode;
	}

	//replace the children of one node with the children of another
	function replaceNodeChildren(node, withNode) {
		node.innerHTML = "";
		for (var n = 0, nl = withNode.childNodes.length; n < nl; n++){
			node.appendChild(withNode.childNodes[0]);
		} 
	}



	function DOMDiffer(options) {}
	DOMDiffer.prototype.diffNodes = diffNodes;
	DOMDiffer.prototype.nodeToVNode = nodeToVNode;
	DOMDiffer.prototype.diffVNodes =diffVNodes;
	DOMDiffer.prototype.flattenVNode = flattenVNode;
	DOMDiffer.prototype.diffFlatVNodes = diffFlatVNodes;
	DOMDiffer.prototype.vNodeApplyDiff = vNodeApplyDiff;
	DOMDiffer.prototype.vNodeToNode = vNodeToNode;
	DOMDiffer.prototype.nodeApplyDiff = nodeApplyDiff;
	DOMDiffer.prototype.replaceNodeChildren = replaceNodeChildren;


	window.DOMDiffer = DOMDiffer;

});