$(function() {

	var trim_regex = /^\s+|\s+$/g;

	var proto = {
		//turn dom nodes into vnodes and diff
		nodesDiff: function nodesDiff(source, destination) {
			var vsource = this.nodeToVNode(source);
			var vdestination = this.nodeToVNode(destination);
			return this.vNodesDiff(vsource, vdestination);
		},

		//turn don node into vnode
		nodeToVNode: function nodeToVNode(DOMNode, options) {
			options = options || {
				depth: 0,
				index: 0,
				uid: 0,
				parentUid: -1
			};
			var depth = options.depth;
			var index = options.index;
			var vNode = {
				DOMNode: DOMNode,
				nodeType: DOMNode.nodeType,
				nodeName: DOMNode.nodeName,
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
			var nodeAttribtes = DOMNode.attributes;
			var vNodeAttributes = vNode.attributes;
			for (var i = 0, l = nodeAttribtes.length; i < l; i++) {
				var attribute = nodeAttribtes.item(i);
				if (attribute.name === "class") {
					var vNodeClasses = vNode.classes;
					var classes = attribute.value.split(" ");
					for (var i = 0, l = classes.length; i < l; i++) {
						vNodeClasses[classes[i]] = true;
					}
					continue;
				}
				if (attribute.name === "id") {
					vNode.id = attribute.value;
					continue;
				}
				vNodeAttributes[attribute.name] = attribute.value;
			}
			var deep = 1;
			for (var i = 0, l = DOMNode.childNodes.length; i < l; i++) {
				var childNode = DOMNode.childNodes[i];
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
					var vChildNode = this.nodeToVNode(childNode, childOptions);
					deep = deep+vChildNode.deep;
					options.uid = childOptions.uid;
					break;
				case 3:
					vChildNode = {
						DOMNode: childNode,
						nodeType: childNodeType,
						nodeName: childNode.nodeName,
						data: childNode.data,
						trimmed: this._trim(childNode.data),
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
		},

		//trim whitespace from a string ends
		_trim: function _trim(string) {
			return string.replace(trim_regex, '');
		},

		//flatten vnodes and diff
		vNodesDiff: function vNodesDiff(vsource, vdestination) {
			var fVSource = this._vNodeToFVNode(vsource);
			var fVDestination = this._vNodeToFVNode(vdestination);
			return this._fVNodesDiff(fVSource, fVDestination);
		},

		//flatten a vnode
		_vNodeToFVNode: function _vNodeToFVNode(vNode, rtn) {
			rtn = rtn || [];
			switch (vNode.nodeType) {
			case 1:
				rtn.push(vNode);
				for (var i = 0, l = vNode.childNodes.length; i < l; i++) {
					this._vNodeToFVNode(vNode.childNodes[i], rtn);
				}
				break;
			case 3:
				rtn.push(vNode);
				break;
			}
			return rtn;
		},

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
		_fVNodesDiff: function _fVNodesDiff(fVSource, fVDestination) {

			//create editable arrays to preserve original arrays
			var fVSource2 = fVSource.slice(0);
			var fVDestination2 = fVDestination.slice(0);

			//try to match containers
			var sourceMatches = [];
			this._compareAndRemoveFVNodes(fVSource2, fVDestination2, 1, sourceMatches);
			this._compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.80, sourceMatches);
			this._compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.60, sourceMatches);
			this._compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.40, sourceMatches);
			this._compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.20, sourceMatches);

			var removes = this._createRemoveMatches(fVSource2, sourceMatches);
			var adds = this._createAddMatches(fVDestination2, sourceMatches);

			var uidIndexes = this._makeUidIndexes(sourceMatches);

			this._expandMatchDifferencesAndStripNodes(sourceMatches, uidIndexes);

			var destinationStartVNode = this._fVNodeToVNode(fVDestination);
			var orderedMatches = this._rebuildDestinationFromSourceMatches(destinationStartVNode, sourceMatches);

			var differential = [].concat(
				removes, //re-add removes as they get lost in the ordering
				orderedMatches
			)

			//find the start node on the original source
			var sourceStartVNode = this._fVNodeToVNode(fVSource);
		
			//remove redundant differentials by applying the diff
			//use cloneSourceVNode so as not to change the original source vnode
			this.vNodeDiffApply(sourceStartVNode, differential, {
				cloneSourceVNode: true,
				performOnDOM: false
			});

			return differential;
		},

		//compare each source vnode with each destination vnode
		//when a match is found, remove both the source and destination from their original flattened arrays and add a match diff object
		_compareAndRemoveFVNodes: function _compareAndRemoveFVNodes(fVSource, fVDestination, minRate, sourceMatches) {
			if (fVSource.length === 0 || fVDestination.length === 0) return;

			var fIndex = fVSource.length-1;
			var f2Index = fVDestination.length-1;

			var maxRating = -1, maxRated, maxRatedF2Index, rated = [];
			while (fIndex >= 0) {

				var source = fVSource[fIndex];
				var destination = fVDestination[f2Index];

				var rate = this._rateCompare(destination, source);

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
								sourceIndex: source.index,
								destinationUid: maxRated.uid,
								destinationParentUid: maxRated.parentUid,
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
							destination: maxRated,
							nodeType: source.nodeType,
							sourceUid: source.uid,
							sourceParentUid: source.parentUid,
							sourceIndex: source.index,
							destinationUid: maxRated.uid,
							destinationParentUid: maxRated.parentUid,
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
		}, 

		//create a percentage difference value for two vnodes
		//20% for matching ids
		//20% for the same depth
		//13.3% for matching attributes
		//13.3% for matching classes

		//6.6% for matching nodenames
		//6.6% if both have children or not
		//6.6% if number of children is equal

		//6.6% if both have the same number of nodes deep
		//6.6% if both are at the same index

		_rateCompare: function _rateCompare(vdestination, vsource) {
			var value = 0;
			if (vdestination.nodeType !== vsource.nodeType) return -1;

			var rate = -1;
			switch (vdestination.nodeType) {
			case 1:
				
				value+=vsource.id===vdestination.id?3:0;
				value+=vsource.depth === vdestination.depth ? 3 : 0;

				value+=this._keyValueCompare(vsource.attributes, vdestination.attributes) * 2;
				value+=this._keyValueCompare(vsource.classes, vdestination.classes) * 2;

				value+=vsource.nodeName === vdestination.nodeName?1:0;

				value+=(vsource.childNodes.length !== 0) === (vdestination.childNodes.length !== 0) ? 1 : 0;
				value+=vsource.childNodes.length === vdestination.childNodes.length ? 1 : 0;
				
				value+=vsource.deep === vdestination.deep ? 1 : 0;
				value+=vsource.index === vdestination.index ? 1 : 0;

				rate = (value / 15) || -1;

				break;
			case 3:
				value+=vsource.trimmed === vdestination.trimmed ? 2 : 0;
				value+=vsource.data === vdestination.data ? 1 : 0;
				rate = (value / 3) || -1;
			}

			return rate;
		},

		//compare two key value pair objects
		//return percentage match 0-1
		_keyValueCompare: function _keyValueCompare(object1, object2) {
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
		},

		//manufacture 'matches' for the items to remove from the source tree
		_createRemoveMatches: function _createRemoveMatches(fVSource2, sourceMatches) {
			var removes = [];
			for (var i = 0, l = fVSource2.length; i < l; i++) {
				var source = fVSource2[i];
				var diffObj = {
					changeRemove: true,
					source: source,
					nodeType: source.nodeType,
					sourceUid: source.uid,
					sourceParentUid: source.parentUid,
				};
				sourceMatches.push(diffObj);
				removes.push(diffObj);
			}
			return removes;
		},

		//manufacture 'matches' for the items to add to the source tree from the destination
		_createAddMatches: function _createAddMatches(fVDestination2, sourceMatches) {
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
				var fVSource = this._vNodeToFVNode(clone(newDestinationRoots[i], {"DOMNode": true})); //clone for new source nodes
				var fVDestination = _vNodeToFVNode(newDestinationRoots[i]);
				for (var c = 0, cl = fVDestination.length; c < cl; c++) {
					var destination = fVDestination[c];
					var source = this._vNodeToOuterVNode(fVSource[c]);

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
					source.DOMNode = undefined; //remove destination node from the diff

					var diffObj = {
						changeAdd: true,
						destination: destination,
						nodeType: destination.nodeType,
						destinationUid: destination.uid,
						destinationParentUid: destination.parentUid,
						relocateIndex: destination.index,
						changeIndex: true,
						source: source,
						addVNode: source,
						sourceUid: newSourceUid,
						sourceParentUid: newSourceParentUid,
						sourceIndex: source.index
					}

					sourceMatches.push(diffObj);
					addMatches.push(diffObj);
				}
			}

			return addMatches;
		},

		//index all of the match nodes by their source and destination uids
		_makeUidIndexes: function _makeUidIndexes(sourceMatches) {
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
		},

		//iterate through all of the matches
		_expandMatchDifferencesAndStripNodes: function _expandMatchDifferencesAndStripNodes(sourceMatches, uidIndexes) {
			for (var i = 0, l = sourceMatches.length; i < l; i++) {
				var diff = sourceMatches[i];
				this._expandDifferences(diff, uidIndexes);
				delete diff.source;
				delete diff.destination;
			}
		},

		//add attributes to the match to express the differences between each pair
		//this makes each match-pair into a match-diff
		_expandDifferences: function _expandDifferences(match, uidIndexes) {

			if (match.equal || match.changeRemove || match.changeAdd) return;

			var source = match.source;
			var destination = match.destination;

			switch(match.nodeType) {
			case 1:
				if (source.nodeName !== destination.nodeName) match.changeNodeName = destination.nodeName;
				match.changeAttributes = this._diffKeys(source.attributes, destination.attributes);
				match.changeClasses = this._diffKeys(source.classes, destination.classes);
				if (source.id !== destination.id) match.changeId = destination.id;

				if (match.destinationParentUid === -1) break;

				var relocateParentUid = uidIndexes.byDestinationUid[match.destinationParentUid].sourceUid;
				if (relocateParentUid !== match.sourceParentUid) {
					match.relocateIndex =  destination.index;
					match.relocateParentUid = relocateParentUid;
					match.changeParent = true;
				} else if (source.index !== destination.index) {
					match.relocateIndex =  destination.index;
					match.changeIndex = true;
				}

				break;
			case 3:
				if (source.data !== destination.data) match.changeData = destination.data;
				break;
			}

		},

		//describe the differences between two objects (source & destination attributes, or source & destination classes)
		_diffKeys: function _diffKeys (source, destination) {
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
		},

		//find the first vnode in a flattened vnode list
		_fVNodeToVNode: function _fVNodeToVNode(fVNode) {
			var startVNode;
			for (var i = 0, l = fVNode.length; i < l; i++) {
				if (fVNode[i].parentUid === -1) {
					startVNode = fVNode[i];
					break;
				}
			}
			if (!startVNode) throw "cannot find start node";
			return startVNode;
		},

		//recursively go through the destination tree, checking each source mapped node (or added node) and outputing the match-diffs where necessary
		//this filters and orders the match-diffs creating a preliminary differential
		_rebuildDestinationFromSourceMatches: function _rebuildDestinationFromSourceMatches(startVNode, sourceMatches, uidIndexes, parentVNode, newIndex) {
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

			
			//check if equal but should be in a different parent or at different index
			if (diff.equal && parentVNode !== undefined
				&& uidIndexes.bySourceUid[diff.sourceParentUid] 
				&& uidIndexes.bySourceUid[diff.sourceParentUid].destinationUid !== parentVNode.uid 
				) {

				var modeToSourceUid = uidIndexes.byDestinationUid[parentVNode.uid].sourceUid;
				//mark to move into a different parent
				diff.equal = false;
				diff.changeParent = true;
				diff.changeIndex = true;
				//fetch source parent to relocate node to
				diff.relocateParentUid = modeToSourceUid;
				diff.relocateIndex = newIndex;
			} else if (newIndex !== undefined
				&& diff.sourceIndex !== newIndex) {

				//check if should relocate to a different index

				diff.equal = false;
				diff.changeIndex = true;
				diff.relocateIndex = newIndex;
			}

			switch (diff.nodeType) {
			case 1:
				if (!diff.equal
					&& (diff.changeAdd
					|| diff.changeId
					|| diff.changeNodeName
					|| (diff.changeAttributes && !diff.changeAttributes.isEqual)
					|| (diff.changeClasses && !diff.changeClasses.isEqual)
					|| diff.changeParent
					|| diff.changeIndex
					)) {
					diffs.push(diff);
				}
				for (var i = 0, l = startVNode.childNodes.length; i < l; i++) {
					var childNode = startVNode.childNodes[i];
					diffs = diffs.concat(this._rebuildDestinationFromSourceMatches(childNode, sourceMatches, uidIndexes, startVNode, i));
				}
				break;
			case 3:
				if (!diff.equal
					&& (diff.changeData
					|| diff.changeAdd
					|| diff.changeParent
					|| diff.changeIndex
					)) {
					diffs.push(diff);
				}
				break;
			}

			return diffs;

		},

		//apply the differential to the vnode, optionally cloning the vnode so as not to change it
		vNodeDiffApply: function vNodeDiffApply(startVNode, differential, options) {

			options = options || {
				cloneSourceVNode: false,
				performOnDOM: false
			};

			if (options.cloneSourceVNode) startVNode = this._cloneObject(startVNode, {"DOMNode":true});

			var fVStartNode = this._vNodeToFVNode(startVNode);
			var differential2 = this._cloneObject(differential, {"DOMNode":true});

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

				if (diff.changeRemove) {
					var parentVNode = bySourceUid[diff.sourceParentUid];
					if (parentVNode.nodeType === 3) throw "cannot find children of a text node";

					var found = false;
					for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
						if ( parentVNode.childNodes[r].uid === diff.sourceUid) {

							if (options.performOnDOM) {
								parentVNode.DOMNode.removeChild(vNode.DOMNode);
							}

							parentVNode.childNodes.splice(r,1);
							found = true;
							break;
						}
					}
					if (!found) throw "Remove not found";

					diff.complete = true;
					continue;
				}

				if (diff.changeAdd) {
					var parentVNode = bySourceUid[diff.sourceParentUid];
					
					var newSourceVNode = this._cloneObject(diff.addVNode, {"DOMNode":true});
					var newNode = this.vNodeToNode(newSourceVNode);
					newSourceVNode.DOMNode = newNode;

					//index the new diff by source id so that subsequent child adds have somewhere to go
					bySourceUid[diff.sourceUid] = newSourceVNode;

					if (parentVNode.childNodes.length === 0) {

						if (options.performOnDOM) {
							parentVNode.DOMNode.appendChild(newNode);
						}

						parentVNode.childNodes.push(newSourceVNode);

					} else {

						if (options.performOnDOM) {
							//assign the new node to the diff otherwise subsequent children will add to the previous destination as a parent
							parentVNode.DOMNode.insertBefore(newNode, parentVNode.DOMNode.childNodes[diff.relocateIndex]);
						}

						parentVNode.childNodes.splice(diff.relocateIndex,0, newSourceVNode);
					}

					diff.complete = true;
					continue;
				}
				
				//change attributes
				if (diff.changeAttributes) {
					var attributes = diff.changeAttributes;
					if (attributes.removed.length > 0) {
						for (var r = 0, rl = attributes.removed.length; r < rl; r++) {

							if (options.performOnDOM) {
								vNode.DOMNode.removeAttribute(attributes.removed[r]);
							}

							delete vNode.attributes[attributes.removed[r]];
						}
					}
					if (attributes.changedLength > 0) {
						for (var k in attributes.changed) {

							if (options.performOnDOM) {
								vNode.DOMNode.setAttribute(k, attributes.changed[k]);
							}

							vNode.attributes[k] = attributes.changed[k];
						}
					}
					if (attributes.addedLength > 0) {
						for (var k in attributes.added) {

							if (options.performOnDOM) {
								vNode.DOMNode.setAttribute(k, attributes.added[k]);
							}

							vNode.attributes[k] = attributes.added[k];
						}
					}
					diff.complete = true;
				}

				if (diff.changeId) {
					if (options.performOnDOM) {
						vNode.DOMNode.setAttribute('id', diff.changeId);
					}
					vNode.id = diff.changeId;
					diff.complete = true;
				}

				//change classes
				if (diff.changeClasses) {
					var classes = diff.changeClasses;
					if (classes.removed.length > 0) {
						for (var r = 0, rl = classes.removed.length; r < rl; r++) {
							delete vNode.classes[classes.removed[r]];
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
							var finalClass = classNames.join(" ");
							if (finalClass === "") {
								vNode.DOMNode.removeAttribute("class");
							} else {
								vNode.DOMNode.setAttribute("class", finalClass);
							}
							
						}
					}

					diff.complete = true;
				}

				//change data
				if (diff.changeData !== false && diff.changeData !== undefined) {

					if (options.performOnDOM) {
						vNode.DOMNode.data = diff.changeData;
					}

					vNode.data = diff.changeData;
					diff.complete = true;
				}

				//change nodeName
				if (diff.changeNodeName !== false && diff.changeNodeName !== undefined) {

					if (options.performOnDOM) {
						//create a new node, add the attributes
						var parentNode = bySourceUid[diff.sourceParentUid].DOMNode;
						var newNode = document.createElement(diff.changeNodeName);
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
						this.nodeReplaceChildren(newNode, vNode.DOMNode);

						//replace diff node and dom node so that subsequent children have the right location
						parentNode.replaceChild(newNode, vNode.DOMNode);
						vNode.DOMNode = newNode;
					}

					vNode.nodeName = diff.changeNodeName;
					diff.complete = true;
				}

				if (diff.changeParent) {
					var oldParentVNode = bySourceUid[diff.sourceParentUid];
					var newParentVNode = bySourceUid[diff.relocateParentUid];

					//remove from original source childNodes
					var found = false;
					var moveNode;
					for (var r = 0, rl = oldParentVNode.childNodes.length; r < rl; r++) {
						if ( oldParentVNode.childNodes[r].uid === diff.sourceUid) {

							if (options.performOnDOM) {
								moveNode = oldParentVNode.DOMNode.childNodes[r];
							}

							oldParentVNode.childNodes.splice(r, 1);
							found = true;
							break;
						}
					}
					if (!found) {
						throw "cannot find object to move in parent";
					}

					//add to final source childNode
					found = false;
					if (diff.relocateIndex === newParentVNode.childNodes.length) {

						if (options.performOnDOM) {
							newParentVNode.DOMNode.appendChild(moveNode);
						}

						newParentVNode.childNodes.push(vNode);

					} else {
						for (var r = 0, rl = newParentVNode.childNodes.length; r < rl; r++) {
							if ( r === diff.relocateIndex ) {

								if (options.performOnDOM) {
									newParentVNode.DOMNode.insertBefore(moveNode, newParentVNode.DOMNode.childNodes[r]);
								}

								newParentVNode.childNodes.splice(r, 0, vNode);
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

				if (!diff.changeAdd && !diff.changeParent && diff.changeIndex) {
					var parentVNode = bySourceUid[diff.sourceParentUid];
					for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
						parentVNode.childNodes[r].index = r;
					}

					if (diff.relocateIndex === vNode.index) {
						diff.redundant = true;
					} else {

						if (options.performOnDOM) {
							var afterNode = parentVNode.DOMNode.childNodes[diff.relocateIndex];
							var moveNode = parentVNode.DOMNode.childNodes[vNode.index];
							parentVNode.DOMNode.insertBefore(moveNode, afterNode);
						}

						parentVNode.childNodes.splice(vNode.index,1);
						parentVNode.childNodes.splice(diff.relocateIndex,0,vNode);
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
		},

		//clone basic javascript Array, Object and primative structures
		_cloneObject: function _cloneObject(value, copy) {
			if (typeof value === "object") {
				if (value instanceof Array) {
					var rtn = [];
					for (var i = 0, l = value.length; i < l; i++) {
						rtn[i] = this._cloneObject(value[i], copy);
					}
					return rtn;
				}
				var rtn = {};
				for (var k in value) {
					if (copy && copy[k]) {
						rtn[k] = value[k]
					} else {
						rtn[k] = this._cloneObject(value[k], copy);
					}
				}
				return rtn;
			}
			return value;
		},

		_vNodeToOuterVNode: function _vNodeToOuterVNode(vNode) {
			switch (vNode.nodeType) {
			case 1:
				vNode.childNodes.length = 0;
			}
			return vNode;
		},

		//render a node into a dom node
		vNodeToNode: function vNodeToNode(vNode) {

			var DOMNode;
			switch (vNode.nodeType) {
			case 1:
				DOMNode = document.createElement(vNode.nodeName);
				for (var k in vNode.attributes) {
					var attr = document.createAttribute(k);
					attr.value = vNode.attributes[k];
					DOMNode.attributes.setNamedItem(attr);
				}
				var classes = [];
				for (var k in vNode.classes) {
					classes.push(k);			
				}
				var className = classes.join(" ");
				if (className) {
					var attr = document.createAttribute("class");
					attr.value = className;
					DOMNode.attributes.setNamedItem(attr);
				}
				if (vNode.id) {
					var attr = document.createAttribute("id");
					attr.value = vNode.id;
					DOMNode.attributes.setNamedItem(attr);
				}
				for (var i = 0, l = vNode.childNodes.length; i < l; i++) {
					DOMNode.appendChild( vNodeToNode(vNode.childNodes[i]) );
				}
				break;
			case 3:
				DOMNode = document.createTextNode(vNode.data);
				break;
			}

			return DOMNode;
		},

		nodeDiffApply: function nodeDiffApply(DOMNode, differential) {
			var startVNode = this.nodeToVNode(DOMNode);

			this.vNodeDiffApply(startVNode, differential, {
				cloneSourceVNode: false,
				performOnDOM: true
			});

			return startVNode;
		},

		//replace the children of one node with the children of another
		nodeReplaceChildren: function nodeReplaceChildren(DOMNode, withNode) {
			DOMNode.innerHTML = "";
			for (var n = 0, nl = withNode.childNodes.length; n < nl; n++){
				DOMNode.appendChild(withNode.childNodes[0]);
			} 
		},

		nodesAreEqual: function nodesAreEqual(node1, node2, forDebug) {

			var vNode1 = nodeToVNode(node1);
			var vNode2 = nodeToVNode(node2);

			return this.vNodesAreEqual(vNode1, vNode2, forDebug);

		},

		vNodesAreEqual: function vNodesAreEqual(vNode1, vNode2, forDebug) {

			var rate = this._rateCompare(vNode1, vNode2);
			if (rate !== 1) {
				if (forDebug) debugger;
				return false;
			}

			switch (vNode1.nodeType) {
			case 1:
				for (var i = 0, l = vNode1.childNodes.length; i < l; i++) {
					if (!this.vNodesAreEqual(vNode1.childNodes[i], vNode2.childNodes[i], forDebug)) {
						return false;
					}
				}
				break;
			}

			return true;

		}

	};

	
	function DOMDiffer(options) {}
	for (var k in proto) DOMDiffer.prototype[k] = proto[k];


	window.DOMDiffer = DOMDiffer;

});