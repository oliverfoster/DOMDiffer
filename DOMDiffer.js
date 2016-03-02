//https://github.com/oliverfoster/DOMDiffer 2016-02-23

// Uses CommonJS, AMD or browser globals to register library
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(function() {
            return (root.DOMDiffer = factory());
        });
    } else if (typeof module === 'object' && module.exports) {
        // Node/CommonJS
        module.exports = factory();
    } else {
        // Browser globals
        this.DOMDiffer = factory();
    }
}(this, function () {

    var trim_regex = /^\s+|\s+$/g;
    var svgNS = "http://www.w3.org/2000/svg";

    var proto = {

        //turn dom nodes into vnodes and diff
        nodesDiff: function nodesDiff(source, destination, options) {
            var vsource = this.nodeToVNode(source);
            var vdestination = this.nodeToVNode(destination);
            return this.vNodesDiff(vsource, vdestination, options);
        },

        //turn dom node into vnode
        nodeToVNode: function nodeToVNode(DOMNode, options, context) {

            options = options || {};

            if (context === undefined) {

                context = {
                    depth: 0,
                    index: 0,
                    uid: 0,
                    parentUid: -1
                };

                //setup regexs etc
                this._processOptions();
            }

            //build vNode
            var vNode = this._vNodeFromNode(DOMNode, context);

            this._vNodeAttributes(DOMNode, vNode);
            this._injectSpecialAttributes(DOMNode, vNode);

            if (options.ignoreChildren !== true) {
                this._vNodeChildren(DOMNode, vNode, options, context);
            }
            
            return vNode;
        },

        _processOptions: function _processOptions() {

            var ignoreAttributesWithPrefix = this.options.ignoreAttributesWithPrefix;
            var ignoreAttributes = this.options.ignoreAttributes;
            if ((ignoreAttributesWithPrefix === undefined || ignoreAttributesWithPrefix.length === 0)
                && (ignoreAttributes === undefined || ignoreAttributes.length === 0)) return;

            var regex = "";
            var lastIndex = ignoreAttributesWithPrefix.length-1;
            for (var i = 0, l = ignoreAttributesWithPrefix.length; i < l; i++) {
                var prefix = ignoreAttributesWithPrefix[i];
                regex+="^"+this._escapeRegExp(prefix);
                if (i !== lastIndex) {
                    regex+="|";
                }
            }

            if (regex !== "" && ignoreAttributes.length > 0) {
                regex += "|";
            }

            lastIndex = ignoreAttributes.length-1;
            for (var i = 0, l = ignoreAttributes.length; i < l; i++) {
                var attribute = ignoreAttributes[i];
                regex+=this._escapeRegExp(attribute);
                if (i !== lastIndex) {
                    regex+="|";
                }
            }

            this.options._ignoreAttributes = new RegExp(regex, "i");


        },

        _escapeRegExp: function _escapeRegExp(str) {
          return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        },

        _vNodeFromNode: function _vNodeFromNode(DOMNode, options) {
            //capture depth and index from parent
            var depth = options.depth;
            var index = options.index;
            
            var vNode = {
                DOMNode: DOMNode,
                nodeType: DOMNode.nodeType,
                nodeName: DOMNode.nodeName,
                attributes: {},
                id: "",
                classes: {},
                childNodes: [],
                depth: depth,
                index: index,
                deep: 0,
                uid: options.uid++,
                parentUid: options.parentUid
            };
            return vNode;
        },

        _vNodeAttributes: function _vNodeAttributes(DOMNode, vNode) {
            //build vNode attributes
            var nodeAttributes = DOMNode.attributes;
            var vNodeAttributes = vNode.attributes;
            var vNodeClasses = vNode.classes;

            for (var i = 0, attribute; attribute = nodeAttributes.item(i++);) {
                var attributeName = attribute.name;
                var attributeValue = attribute.value;

                var allowedAttribute = this._isAllowedAttribute(attributeName);
                if (allowedAttribute === false) continue;

                switch (attributeName) {
                case "class":
                    var classes = attributeValue.split(" ");
                    for (var c = 0, cl = classes.length; c < cl; c++) {
                        var className = classes[c];
                        if (className === "") continue;
                        var allowedClass = this._isAllowedClass(className);
                        if (allowedClass === false) continue;
                        vNodeClasses[className] = true;
                    }
                    continue;
                case "id":
                    vNode.id = attributeValue;
                    continue;
                }

                vNodeAttributes[attributeName] = attributeValue;
            }
        },

        _isAllowedAttribute: function _isAllowedAttribute(attribute) {

            var _ignoreAttributes = this.options._ignoreAttributes;
            if (_ignoreAttributes === undefined) return true;

            //ignore matching attribute names
            var isMatched = _ignoreAttributes.test(attribute);

            return !isMatched;

        },

        _isAllowedClass: function _isAllowedClass(className) {

            var ignoreClasses = this.options.ignoreClasses;
            if (ignoreClasses === undefined || ignoreClasses.length === 0) return true;

            //ignore matching classes
            for (var i = 0, l = ignoreClasses.length; i < l; i++) {
                var ignoreClass = ignoreClasses[i];
                if (ignoreClass === className) {
                    return false;
                }
            }

            return true;

        },

        _injectSpecialAttributes: function _injectSpecialAttributes(DOMNode, vNode) {
            var vNodeAttributes = vNode.attributes;

            switch (vNode.nodeName) {
            case "svg":
                if (vNodeAttributes["xmlns"] === undefined) vNodeAttributes["xmlns"] = svgNS;
                break;
            }
        },

        _vNodeChildren: function _vNodeChildren(DOMNode, vNode, options, context) {
            var allowedSubTree = this._isAllowedSubTree(vNode);
            if (allowedSubTree === false) return;

            //capture deep from childNodes
            var deep = 1;

            var vChildNodes = vNode.childNodes;
            for (var i = 0, l = DOMNode.childNodes.length; i < l; i++) {
                var childNode = DOMNode.childNodes[i];
                var childNodeType = childNode.nodeType;

                switch (childNodeType) {
                case 1:
                    var childContext = {
                        depth: vNode.depth+1, 
                        index: i,
                        uid: context.uid, // carry current uid count through
                        parentUid: vNode.uid
                    };
                    var vChildNode = this.nodeToVNode(childNode, options, childContext);
                    deep = deep+vChildNode.deep;
                    context.uid = childContext.uid;
                    break;
                case 3:
                    //add text node
                    vChildNode = {
                        DOMNode: childNode,
                        nodeType: childNodeType,
                        nodeName: childNode.nodeName,
                        data: childNode.data,
                        trimmed: this._trim(childNode.data),
                        index: i,
                        depth: vNode.depth+1,
                        deep: 0,
                        uid: context.uid++,
                        parentUid: vNode.uid
                    };
                    break;
                }

                vChildNodes.push(vChildNode);
            }

            vNode.deep = deep;
        },

        _isAllowedSubTree: function _isAllowedSubTree(vNode) {
            //don't stop at root nodes
            if (vNode.parentUid === -1) return true;

            var ignoreSubTreesWithAttributes = this.options.ignoreSubTreesWithAttributes;
            if (ignoreSubTreesWithAttributes === undefined || ignoreSubTreesWithAttributes.length === 0) return true;

            //if node has attribute then stop building tree here
            for (var i = 0, l = ignoreSubTreesWithAttributes.length; i < l; i++) {
                var attr = ignoreSubTreesWithAttributes[i];
                if (vNode.attributes.hasOwnProperty(attr)) {
                    return false;
                }
            }

            return true;

        },

        //trim whitespace from a string ends
        _trim: function _trim(string) {
            return string.replace(trim_regex, '');
        },

        //flatten vnodes and diff
        vNodesDiff: function vNodesDiff(vsource, vdestination, options) {
            var fVSource = this._vNodeToFVNode(vsource);
            var fVDestination = this._vNodeToFVNode(vdestination);
            return this._fVNodesDiff(fVSource, fVDestination, options);
        },

        //flatten a vnode
        _vNodeToFVNode: function _vNodeToFVNode(vNode, rtn) {
            rtn = rtn || [];
            switch (vNode.nodeType) {
            case 1:
                rtn.push(vNode);
                var childNodes = vNode.childNodes;
                for (var i = 0, l = childNodes.length; i < l; i++) {
                    this._vNodeToFVNode(childNodes[i], rtn);
                }
                break;
            case 3:
                rtn.push(vNode);
                break;
            }
            return rtn;
        },

        //create a differential of flattened vnodes
        //1. match source nodes to the best destination node
        //2. create matches to remove all left-over source nodes with no matches
        //3. index each match by it's source and destination
        //4. create matches to add all left-over destination nodes
        //5. expand the differences between each match
        //6. find the start destination node
        //7. rebuild destination tree from source tree using added nodes where necessary and returning the order of the differences
        //8. use the differential to turn a copy of the source tree into the destination tree, removing redundant diffs on the way
        //9. return finished differential
        _fVNodesDiff: function _fVNodesDiff(fVSource, fVDestination, options) {

            options = options || {};

            //create editable arrays to preserve original arrays
            var fVSource2 = fVSource.slice(0);
            var fVDestination2 = fVDestination.slice(0);

            //try to match containers
            var sourceMatches = [];
            var matchIndex = {};

            this._compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.20, sourceMatches, matchIndex);

            matchIndex = undefined;

            var removes = this._createRemoveMatches(fVSource2, sourceMatches);

            var uidIndexes = this._makeUidIndexes(sourceMatches);

            var adds = this._createAddMatches(fVDestination2, sourceMatches, uidIndexes);

            fVSource2 = undefined;
            fVDestination2 = undefined;

            this._expandMatchDifferencesAndStripNodes(sourceMatches, uidIndexes, options);

            var destinationStartVNode = this._fVNodeToVNode(fVDestination);
            var orderedMatches = this._rebuildDestinationFromSourceMatches(destinationStartVNode, sourceMatches, uidIndexes);

            sourceMatches = undefined;

            var differential = [].concat(
                removes, //re-add removes as they get lost in the ordering
                orderedMatches
            )

            //find the start node on the original source
            var sourceStartVNode = this._fVNodeToVNode(fVSource);
        
            //remove redundant differentials by test-applying the diff
            //use performOnVNode: false so as not to change the original source vnode
            //use performOnDOM: false so as not to change the original dom structure
            this.vNodeDiffApply(sourceStartVNode, differential, {
                performOnVNode: false,
                performOnDOM: false
            });

            return differential;
        },

        //compare each source vnode with each destination vnode
        //when a match is found, remove both the source and destination from their original flattened arrays and add a match diff object
        _compareAndRemoveFVNodes: function _compareAndRemoveFVNodes(fVSource, fVDestination, minRate, sourceMatches, matchIndex) {
            if (fVSource.length === 0 || fVDestination.length === 0) return;

            //always remove root containers as matches first
            if (fVSource[0].parentUid === -1 && fVDestination[0].parentUid === -1) {
                var source = fVSource[0];
                var destination = fVDestination[0];
                var rate = this._rateCompare(source, destination);
                fVSource.splice(0, 1);
                fVDestination.splice(0, 1);
                diffObj = {
                    source: source,
                    destination: destination,
                    nodeType: source.nodeType,
                    sourceUid: source.uid,
                    sourceParentUid: source.parentUid,
                    sourceIndex: source.index,
                    destinationUid: destination.uid,
                    destinationParentUid: destination.parentUid,
                    equal: rate === 1,
                    rate: rate
                };
                sourceMatches.push(diffObj);
            }

            var fIndex = fVSource.length-1;
            var f2Index = fVDestination.length-1;

            var maxRating = -1, maxRated, maxRatedIndex;

            //match each source piece to the best destination piece
            //this way the fewest source moves will be made
            var sourceTop = fVSource.length;
            for (var sIndex = 0; sIndex < sourceTop; sIndex++) {

                var source = fVSource[sIndex];
                var sourceUid = source.uid;

                var rated = [];
                for (var dIndex = 0, dLength = fVDestination.length; dIndex < dLength; dIndex++) {

                    var destination = fVDestination[dIndex];
                    var destinationUid = destination.uid;

                    matchIndex[sourceUid] = matchIndex[sourceUid] || {};
                    matchIndex[sourceUid][destinationUid] = matchIndex[sourceUid][destinationUid] || this._rateCompare(destination, source);

                    var rate = matchIndex[sourceUid][destinationUid];
                    if (rate > maxRating && rate >= minRate) {
                        rated.push(destination);
                        maxRated = destination;
                        maxRating = rate;
                        maxRatedIndex = dIndex;
                        if (rate === 1) {
                            fVSource.splice(sIndex, 1);
                            fVDestination.splice(dIndex, 1);
                            diffObj = {
                                source: source,
                                destination: destination,
                                nodeType: source.nodeType,
                                sourceUid: sourceUid,
                                sourceParentUid: source.parentUid,
                                sourceIndex: source.index,
                                destinationUid: destination.uid,
                                destinationParentUid: destination.parentUid,
                                equal: rate === 1,
                                rate: rate
                            };
                            sourceMatches.push(diffObj);
                            maxRating = 0;
                            maxRated = undefined;
                            maxRatedIndex = undefined;
                            sIndex = -1;
                            sourceTop--;
                            break;
                        }
                    }

                }

                if (maxRated && maxRating >= minRate) {
                    fVSource.splice(sIndex, 1);
                    fVDestination.splice(maxRatedIndex, 1);
                    diffObj = {
                        source: source,
                        destination: maxRated,
                        nodeType: source.nodeType,
                        sourceUid: source.uid,
                        sourceParentUid: source.parentUid,
                        sourceIndex: source.index,
                        destinationUid: maxRated.uid,
                        destinationParentUid: maxRated.parentUid,
                        equal: rate === 1,
                        rate: maxRating
                    };
                    sourceMatches.push(diffObj);
                    maxRating = 0;
                    maxRated = undefined;
                    maxRatedIndex = undefined;
                    sIndex = -1;
                    sourceTop--;
                }
            }

        }, 

        //create a percentage difference value for two vnodes
        _rateCompare: function _rateCompare(vdestination, vsource) {
            var value = 0;
            if (vdestination.nodeType !== vsource.nodeType) return -1;

            var rate = -1;
            switch (vdestination.nodeType) {
            case 1:
                
                value+=vsource.id===vdestination.id?3:0;
                value+=vsource.depth === vdestination.depth ? 3 : 0;
                value+=this._keyValueCompare(vsource.classes, vdestination.classes) * 3;

                value+=this._keyValueCompare(vsource.attributes, vdestination.attributes) * 2;

                value+=vsource.nodeName === vdestination.nodeName?1:0;

                value+=(vsource.childNodes.length !== 0) === (vdestination.childNodes.length !== 0) ? 1 : 0;
                value+=vsource.childNodes.length === vdestination.childNodes.length ? 1 : 0;
                
                value+=vsource.deep === vdestination.deep ? 1 : 0;
                value+=vsource.index === vdestination.index ? 1 : 0;

                rate = (value / 16) || -1;

                break;
            case 3:
                value+=vsource.depth === vdestination.depth ? 3 : 0;
                value+=vsource.index === vdestination.index ? 1 : 0;

                //ignore whitespace changes
                if (this.options.ignoreWhitespace) {
                    if (vsource.trimmed === vdestination.trimmed && vsource.trimmed === "") {
                        value+=vsource.trimmed === vdestination.trimmed ? 2 : 0;
                        value+=1;
                    } else {
                        value+=vsource.trimmed === vdestination.trimmed ? 2 : 0;
                        value+=vsource.data === vdestination.data ? 1 : 0;
                    }
                } else {
                    value+=vsource.trimmed === vdestination.trimmed ? 2 : 0;
                    value+=vsource.data === vdestination.data ? 1 : 0;
                }
                
                rate = (value / 7) || -1;
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
                if (object1.hasOwnProperty(k2) === false) {
                    totalKeys++;
                }
            }
            if (totalKeys === 0) return 1;
            return (matchingValues / totalKeys) || -1;
        },

        //manufacture 'matches' for the items to remove from the source tree
        _createRemoveMatches: function _createRemoveMatches(fVSource2, sourceMatches) {
            var removes = [];
            for (var i = fVSource2.length-1, l = -1; i > l; i--) {
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
                fVSource2.splice(i,1);
            }
            return removes;
        },

        //manufacture 'matches' for the items to add to the source tree from the destination
        _createAddMatches: function _createAddMatches(fVDestination2, sourceMatches, uidIndexes) {
            if (fVDestination2.length === 0) return [];
            //create new source pieces to add by cloning the needed destination pieces

            var newDestinationRoots = [];
            var destinationParentUids = {};
            for (var f2Index = 0, l = fVDestination2.length; f2Index < l; f2Index++) {

                var destination = fVDestination2[f2Index];
                destinationParentUids[destination.uid] = true;
                if (destinationParentUids[destination.parentUid] === undefined) {
                    newDestinationRoots.push(destination);
                }

            }
            fVDestination2.splice(0, fVDestination2.length)[0];

            //create matches for new objects to that sourceUids don't conflict with preexisting sourceNodes
            //assign new item.sourceUids from the negative spectrum
            var addMatches = [];
            var newSourceUids = -1;
            var translateOldDestionationUidToNewSourceUid = {};
            for (var i = 0, l = newDestinationRoots.length; i < l; i++) {

                var fVSource = this._vNodeToFVNode(this._cloneObject(newDestinationRoots[i], {"DOMNode": true})); //clone for new source nodes
                var fVDestination = this._vNodeToFVNode(newDestinationRoots[i]);

                for (var c = 0, cl = fVDestination.length; c < cl; c++) {

                    var destination = fVDestination[c];
                    var oldDestinationParentUid = destination.parentUid;
                    var oldDestionationUid = destination.uid;

                    var newSourceParentUid = translateOldDestionationUidToNewSourceUid[oldDestinationParentUid];
                    
                    //check if there is an indexed matching destination
                    var existingDiff = uidIndexes.byDestinationUid[destination.uid];
                    if (existingDiff) {
                        //no need to create new nodes as nodes will be moved from existing source
                        translateOldDestionationUidToNewSourceUid[oldDestionationUid] = existingDiff.source.uid;
                        continue;
                    }

                    var source = this.vNodeToOuterVNode(fVSource[c], {performOnVNode: true});
                    var newSourceUid = newSourceUids--;
                    translateOldDestionationUidToNewSourceUid[oldDestionationUid] = newSourceUid;
                    
                    //if we're dealing with a child of a new root
                    if (newSourceParentUid === undefined) {
                        //if no translation to a new uid, not a child of a new root
                        //assume new node is connected to a preexisting source node
                        newSourceParentUid = uidIndexes.byDestinationUid[oldDestinationParentUid].sourceUid;
                    }

                    //configure new source nodes
                    source.uid = newSourceUid;
                    source.parentUid = newSourceParentUid;
                    source.DOMNode = undefined;

                    var vNode = {};
                    switch (source.nodeType) {
                    case 1:
                        vNode.attributes = source.attributes;
                        vNode.classes = source.classes;
                        vNode.id = source.id;
                        vNode.nodeName = source.nodeName;
                        vNode.nodeType = source.nodeType;
                        vNode.childNodes = [];
                        break;
                    case 3:
                        vNode.data = source.data;
                        vNode.nodeType = source.nodeType;
                        vNode.nodeName = source.nodeName;
                        vNode.trimmed = source.trimmed;
                    }
                    vNode.uid = newSourceUid;
                    vNode.parentUid = newSourceParentUid;

                    var diffObj = {
                        changeAdd: true,
                        changeLocation: true,
                        destination: destination,
                        nodeType: destination.nodeType,
                        destinationUid: oldDestionationUid,
                        destinationParentUid: oldDestinationParentUid,
                        relocateIndex: destination.index,
                        depth: destination.depth,
                        deep: destination.deep,
                        changeIndex: true,
                        source: source,
                        vNode: vNode,
                        sourceUid: newSourceUid,
                        sourceParentUid: newSourceParentUid,
                        sourceIndex: source.index
                    }

                    sourceMatches.push(diffObj);
                    addMatches.push(diffObj);
                    uidIndexes.bySourceUid[newSourceUid] = diffObj;
                    uidIndexes.byDestinationUid[oldDestionationUid] = diffObj;
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
            var bySourceUid = uidIndexes.bySourceUid;
            var byDestinationUid = uidIndexes.byDestinationUid;

            for (var i = 0, diff; diff = sourceMatches[i++];) {
                //var diff = sourceMatches[i];
                if (diff.sourceUid !== undefined) {
                    bySourceUid[diff.sourceUid] = diff;
                }
                if (diff.destinationUid !== undefined) {
                    byDestinationUid[diff.destinationUid] = diff;
                }
                if (diff.add) {
                    diff.sourceParentUid = byDestinationUid[diff.destination.parentUid].sourceUid;
                }
            }
            return uidIndexes;
        },

        //iterate through all of the matches
        _expandMatchDifferencesAndStripNodes: function _expandMatchDifferencesAndStripNodes(sourceMatches, uidIndexes, options) {
            for (var i = 0, diff; diff = sourceMatches[i++];) {
                this._expandDifferences(diff, uidIndexes, options);
                delete diff.source;
                delete diff.destination;
            }
        },

        //add attributes to the match to express the differences between each pair
        //this makes each match-pair into a match-diff
        _expandDifferences: function _expandDifferences(match, uidIndexes, options) {

            if (match.changeRemove || match.changeAdd) return;

            var source = match.source;
            var destination = match.destination;

            if (source.parentUid === -1 && (options.ignoreContainer || this.options.ignoreContainer) ) return;

            if (source.deep !== destination.deep
                || source.depth !== destination.depth) {
                    match.changeLocation = true;
                    match.depth = destination.depth;
                    match.deep = destination.deep;
                    match.equal = false;
            }

            switch(match.nodeType) {
            case 1:
                if (source.nodeName !== destination.nodeName) {
                    match.changeNodeName = true;
                    match.nodeName = destination.nodeName;
                    match.equal = false;
                }
                var changeAttributes = this._diffKeys(source.attributes, destination.attributes);
                if (changeAttributes.isEqual === false) {
                    match.changeAttributes = true;
                    match.attributes = changeAttributes;
                    match.equal = false;
                }
                var changeClasses = this._diffKeys(source.classes, destination.classes);
                if (changeClasses.isEqual === false) {
                    match.changeClasses = true;
                    match.classes = changeClasses;
                    match.equal = false;
                }
                if (source.id !== destination.id) {
                    match.changeId = true;
                    match.id = destination.id;
                    match.equal = false;
                }

                break;
            case 3:
                //ignore whitespace changes
                if (this.options.ignoreWhitespace) {
                    if (source.trimmed !== destination.trimmed && source.trimmed !== "") {
                        if (source.data !== destination.data) {
                            match.changeData = true;
                            match.data = destination.data;
                            match.trimmed = destination.trimmed;
                            match.equal = false;
                        }
                    }
                } else {
                    if (source.data !== destination.data) {
                        match.changeData = true;
                        match.data = destination.data;
                        match.trimmed = destination.trimmed;
                        match.equal = false;
                    }
                }

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
                if (exists === false) {
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
                if (exists === false) {
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
            for (var i = 0, vNode; vNode = fVNode[i++];) {
                if (vNode.parentUid === -1) {
                    startVNode = vNode;
                    break;
                }
            }
            if (startVNode === undefined) throw "cannot find start node";
            return startVNode;
        },

        //recursively go through the destination tree, checking each source mapped node (or added node) and outputing the match-diffs where necessary
        //this filters and orders the match-diffs creating a preliminary differential
        _rebuildDestinationFromSourceMatches: function _rebuildDestinationFromSourceMatches(destinationStartVNode, sourceMatches, uidIndexes, destinationParentVNode, newIndex) {

            var diffs = [];
            var diff = uidIndexes.byDestinationUid[destinationStartVNode.uid];

            if (diff.sourceParentUid !== -1) {
                var sourceParentDiff = uidIndexes.bySourceUid[diff.sourceParentUid];
                
                //if source parent destination match, is not the same as the expected destination then move
                if (sourceParentDiff.destinationUid !== destinationParentVNode.uid) {

                    var moveToSourceUid = uidIndexes.byDestinationUid[destinationParentVNode.uid].sourceUid;
                    //mark to move into a different parent
                    diff.equal = false;
                    diff.changeParent = true;
                    diff.changeIndex = true;
                    //fetch source parent to relocate node to
                    diff.relocateParentUid = moveToSourceUid;
                    diff.relocateIndex = newIndex;
                } else if (newIndex !== undefined
                    && diff.sourceIndex !== newIndex) {

                    //check if should relocate to a different index
                    if (newIndex > diff.sourceIndex) {
                        diff.relocateDisplace = true;
                    } else {
                        diff.relocateDisplace = false;
                    }

                    diff.equal = false;
                    diff.changeIndex = true;
                    diff.relocateIndex = newIndex;
                }
            }

            switch (diff.nodeType) {
            case 1:
                if (diff.equal === false
                    || diff.changeAdd === true
                    || diff.changeId === true
                    || diff.changeNodeName === true
                    || diff.changeAttributes === true
                    || diff.changeClasses === true
                    || diff.changeParent === true
                    || diff.changeIndex === true
                    || diff.changeLocation === true
                    ) {
                    diffs.push(diff);
                }
                for (var i = 0, l = destinationStartVNode.childNodes.length; i < l; i++) {
                    var childNode = destinationStartVNode.childNodes[i];
                    var childDiffs = this._rebuildDestinationFromSourceMatches(childNode, sourceMatches, uidIndexes, destinationStartVNode, i);
                    diffs = diffs.concat(childDiffs);
                }
                break;
            case 3:
                if (diff.equal === false
                    || diff.changeData === true
                    || diff.changeAdd === true
                    || diff.changeParent === true
                    || diff.changeIndex === true
                    || diff.changeLocation === true
                    ) {
                    diffs.push(diff);
                }
                break;
            }

            delete diff.equal;
            delete diff.rate;
            delete diff.sourceIndex;

            return diffs;

        },

        //apply the differential to the vnode, optionally cloning the vnode so as not to change it
        vNodeDiffApply: function vNodeDiffApply(startVNode, differential, options) {

            options = options || {
                performOnVNode: true,
                performOnDOM: true
            };

            if (options.performOnVNode !== true) startVNode = this._cloneObject(startVNode, {"DOMNode":true});

            var fVStartNode = this._vNodeToFVNode(startVNode);
            var differential2 = this._cloneObject(differential, {"DOMNode":true});

            var bySourceUid = {};
            for (var i = 0, vStartNode; vStartNode = fVStartNode[i++];) {
                if (bySourceUid[vStartNode.uid]) {
                    throw "duplicate uid in differential";
                }
                bySourceUid[vStartNode.uid] = vStartNode;
            }

            for (var i = 0, diff; diff = differential2[i++];) {    
                //var diff = differential2[i];
                var vNode = bySourceUid[diff.sourceUid];

                if (diff.changeRemove === true) {
                    this._changeRemove(diff, vNode, bySourceUid, options);                    
                    continue;
                }

                if (diff.changeAdd === true) {
                    vNode = this._changeAdd(diff, vNode, bySourceUid, options);
                }
                
                //change attributes
                if (diff.changeAttributes === true) {
                    this._changeAttributes(diff, vNode, bySourceUid, options);
                }

                if (diff.changeId === true) {
                    this._changeId(diff, vNode, bySourceUid, options);
                }

                //change classes
                if (diff.changeClasses === true) {
                    this._changeClasses(diff, vNode, bySourceUid, options);                    
                }

                //change nodeName
                if (diff.changeNodeName === true) {
                    this._changeNodeName(diff, vNode, bySourceUid, options);                    
                }

                if (diff.changeParent === true) {
                    this._changeParent(diff, vNode, bySourceUid, options);
                }

                if (diff.changeIndex === true) {
                    this._changeIndex(diff, vNode, bySourceUid, options);
                }

                //change data
                if (diff.changeData === true) {
                    this._changeData(diff, vNode, bySourceUid, options);                    
                }

                if (diff.changeLocation === true) {
                    this._changeLocation(diff, vNode, bySourceUid, options);
                }

            }

            //remove redundant items from the original diff
            this._removeRedundants(differential, differential2);

            return startVNode;
        },

        _changeRemove: function _changeRemove(diff, vNode, bySourceUid, options) {
            var parentVNode = bySourceUid[diff.sourceParentUid];
            if (parentVNode.nodeType === 3) throw "cannot find children of a text node";

            var found = false;
            for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
                if ( parentVNode.childNodes[r].uid === diff.sourceUid) {

                    if (options.performOnDOM === true) {
                        parentVNode.DOMNode.removeChild(vNode.DOMNode);
                    }

                    parentVNode.childNodes.splice(r,1);
                    found = true;
                    break;
                }
            }
            if (found === false) throw "Remove not found";
        },

        _changeAdd: function _changeAdd(diff, vNode, bySourceUid, options) {
            var parentVNode = bySourceUid[diff.sourceParentUid];
                    
            var newSourceVNode = this._cloneObject(diff.vNode, {"DOMNode":true});
            var newNode = this.vNodeToNode(newSourceVNode);
            newSourceVNode.DOMNode = newNode;

            //index the new diff by source id so that subsequent child adds have somewhere to go
            bySourceUid[diff.sourceUid] = newSourceVNode;
            vNode = newSourceVNode;

            //add to the end
            if (options.performOnDOM === true) {
                parentVNode.DOMNode.appendChild(newNode);
            }

            parentVNode.childNodes.push(newSourceVNode);

            return vNode;
        },

        _changeAttributes: function _changeAttributes(diff, vNode, bySourceUid, options) {
            var attributes = diff.attributes;
            if (attributes.removed.length > 0) {
                for (var r = 0, rl = attributes.removed.length; r < rl; r++) {
                    var key = attributes.removed[r];

                    if (options.performOnDOM === true) {
                        vNode.DOMNode.removeAttribute(key);
                    }

                    delete vNode.attributes[key];
                }
            }
            if (attributes.changedLength > 0) {
                for (var k in attributes.changed) {

                    if (options.performOnDOM === true) {
                        vNode.DOMNode.setAttribute(k, attributes.changed[k]);
                    }

                    vNode.attributes[k] = attributes.changed[k];
                }
            }
            if (attributes.addedLength > 0) {
                for (var k in attributes.added) {

                    if (options.performOnDOM === true) {
                        vNode.DOMNode.setAttribute(k, attributes.added[k]);
                    }

                    vNode.attributes[k] = attributes.added[k];
                }
            }
        },

        _changeId: function _changeId(diff, vNode, bySourceUid, options) {
            if (options.performOnDOM === true) {
                if (diff.id === "") {
                    vNode.DOMNode.removeAttribute('id');
                } else {
                    vNode.DOMNode.setAttribute('id', diff.id);
                }
            }
            vNode.id = diff.id;
        },

        _changeClasses: function _changeClasses(diff, vNode, bySourceUid, options) {
            var classes = diff.classes;
            if (classes.removed.length > 0) {
                for (var r = 0, rl = classes.removed.length; r < rl; r++) {
                    var key = classes.removed[r];
                    delete vNode.classes[key];
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

            if (options.performOnDOM === true) {
                if (classes.isEqual === false) {
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
        },

        _changeNodeName: function _changeNodeName(diff, vNode, bySourceUid, options) {
            if (options.performOnDOM === true) {
                //create a new node, add the attributes
                var parentNode = bySourceUid[diff.sourceParentUid].DOMNode;

                var vNodeOuter = this.vNodeToOuterVNode(vNode, {performOnVNode: false});
                vNodeOuter.nodeName = diff.nodeName;

                var newNode = this.vNodeToNode(vNodeOuter);

                //move all the children from old node to new node
                this.nodeReplaceChildren(newNode, vNode.DOMNode);

                //replace diff node and dom node so that subsequent children have the right location
                parentNode.replaceChild(newNode, vNode.DOMNode);
                vNode.DOMNode = newNode;
            }

            vNode.nodeName = diff.nodeName;
        },

        _changeParent: function _changeParent(diff, vNode, bySourceUid, options) {
            var oldParentVNode = bySourceUid[diff.sourceParentUid];
            var newParentVNode = bySourceUid[diff.relocateParentUid];

            //remove from original source childNodes
            var found = false;
            var moveNode;
            for (var r = 0, rl = oldParentVNode.childNodes.length; r < rl; r++) {
                if ( oldParentVNode.childNodes[r].uid === diff.sourceUid) {

                    if (options.performOnDOM === true) {
                        moveNode = oldParentVNode.DOMNode.childNodes[r];
                    }

                    oldParentVNode.childNodes.splice(r, 1);
                    found = true;
                    break;
                }
            }
            if (found === false) {
                throw "cannot find object to move in parent";
            }

            //add to the end
            if (options.performOnDOM === true) {
                newParentVNode.DOMNode.appendChild(moveNode);
            }

            newParentVNode.childNodes.push(vNode);
        },

        _changeIndex: function _changeIndex(diff, vNode, bySourceUid, options) {
            var parentVNode;
            if (diff.changeParent) {
                //if node changed parents last
                parentVNode = bySourceUid[diff.relocateParentUid];
            } else {
                parentVNode = bySourceUid[diff.sourceParentUid];
            }
            
            //reindex vnodes as they can change around
            for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
                parentVNode.childNodes[r].index = r;
            }

            if (diff.relocateIndex === vNode.index || parentVNode.childNodes.length === 1) {
                if (diff.changeAttributes === undefined
                    && diff.changeClass === undefined
                    && diff.changeNodeName === undefined
                    && diff.changeData === undefined
                    && diff.changeParent === undefined
                    && diff.changeAdd === undefined 
                    && diff.changeRemove === undefined
                    && diff.changeLocation === undefined) {
                        //remove diff if only changing index
                        diff.redundant = true;
                        vNode.index = diff.relocateIndex;
                }
            } else {

                if (diff.relocateDisplace && diff.relocateIndex > vNode.index) {
                    //insert before next, when a node is moved up a list it changes the indices of all the elements above it
                    //it's easier to pick the node after its new position and insert before that one
                    //makes indices come out correctly
                    if (options.performOnDOM === true) {
                        var moveNode = parentVNode.DOMNode.childNodes[vNode.index];

                        var offsetIndex = diff.relocateIndex+1;
                        if (offsetIndex >= parentVNode.DOMNode.childNodes.length) {
                            parentVNode.DOMNode.appendChild(moveNode);
                        } else {
                            var afterNode = parentVNode.DOMNode.childNodes[offsetIndex];
                            parentVNode.DOMNode.insertBefore(moveNode, afterNode);
                        }
                    }
                } else {
                    if (options.performOnDOM === true) {
                        var afterNode = parentVNode.DOMNode.childNodes[diff.relocateIndex];
                        var moveNode = parentVNode.DOMNode.childNodes[vNode.index];
                        parentVNode.DOMNode.insertBefore(moveNode, afterNode);
                    }
                }

                parentVNode.childNodes.splice(vNode.index,1);
                parentVNode.childNodes.splice(diff.relocateIndex,0,vNode);

                //reindex vnodes as they can change around
                for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
                    parentVNode.childNodes[r].index = r;
                }
            }
        },

        _changeData: function _changeData(diff, vNode, bySourceUid, options) {
            if (options.performOnDOM === true) {
                vNode.DOMNode.data = diff.data;
            }

            vNode.data = diff.data;
            vNode.trimmed = diff.trimmed;
        },

        _changeLocation: function _changeLocation(diff, vNode, bySourceUid, options) {
            vNode.depth = diff.depth;
            vNode.deep = diff.deep;
        },

        _removeRedundants: function _removeRedundants(differential, differential2) {
            for (var i = differential2.length-1, l = -1; i > l; i--) {
                var diff = differential2[i];
                if (diff.redundant) {
                    differential.splice(i,1);
                }
            }
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

        //clone and strip the children from the vNode
        vNodeToOuterVNode: function vNodeToOuterVNode(vNode, options) {
            if (options !== undefined && options.performOnVNode === true) {
                vNode = this._cloneObject(vNode, { "DOMNode": true });
            }
            switch (vNode.nodeType) {
            case 1:
                vNode.childNodes.length = 0;
            }
            return vNode;
        },

        //turn dom node into vnode ignoring children
        nodeToOuterVNode: function nodeToOuterVNode(DOMNode, options) {
            options = this._cloneObject(options) || {};
            options.ignoreChildren = true;
            return this.nodeToVNode(DOMNode, options);
        },

        //render a node into a dom node
        vNodeToNode: function vNodeToNode(vNode) {

            var DOMNode;
            switch (vNode.nodeType) {
            case 1:
                switch (vNode.nodeName) {
                case "svg":
                    DOMNode = document.createElementNS(svgNS, vNode.nodeName);
                    break;
                default:
                    DOMNode = document.createElement(vNode.nodeName);
                }
                for (var k in vNode.attributes) {
                    DOMNode.setAttribute(k, vNode.attributes[k]);
                }
                var classes = [];
                for (var k in vNode.classes) {
                    classes.push(k);            
                }
                var className = classes.join(" ");
                if (className) {
                    DOMNode.setAttribute("class", className);
                }
                if (vNode.id) {
                    DOMNode.setAttribute("id", vNode.id);
                }

                for (var i = 0, childNode; childNode = vNode.childNodes[i++];) {
                    DOMNode.appendChild( this.vNodeToNode(childNode) );
                }
                break;
            case 3:
                DOMNode = document.createTextNode(vNode.data);
                break;
            }

            return DOMNode;
        },

        nodeDiffApply: function nodeDiffApply(DOMNode, differential, options) {
            var startVNode = this.nodeToVNode(DOMNode);

            options = options || {
                performOnVNode: true,
                performOnDOM: true
            };

            this.vNodeDiffApply(startVNode, differential, options);

            return startVNode;
        },

        //replace the children of one node with the children of another
        nodeReplaceChildren: function nodeReplaceChildren(DOMNode, withNode) {
            DOMNode.innerHTML = "";
            for (var n = 0, nl = withNode.childNodes.length; n < nl; n++) {
                DOMNode.appendChild(withNode.childNodes[0]);
            } 
        },

        nodesAreEqual: function nodesAreEqual(node1, node2, options) {

            var vNode1 = this.nodeToVNode(node1);
            var vNode2 = this.nodeToVNode(node2);

            return this.vNodesAreEqual(vNode1, vNode2, options);

        },

        vNodesAreEqual: function vNodesAreEqual(vNode1, vNode2, options) {

            options = options || {};

            var rate;
            if (vNode1.parentUid === -1 && (options.ignoreContainer || this.options.ignoreContainer)) {
                rate = 1;
            } else {
                rate = this._rateCompare(vNode1, vNode2);
                if (rate !== 1) {
                    if (options.forDebug === true) debugger;
                    return false;
                }
            }

            switch (vNode1.nodeType) {
            case 1:
                for (var i = 0, l = vNode1.childNodes.length; i < l; i++) {
                    if (this.vNodesAreEqual(vNode1.childNodes[i], vNode2.childNodes[i], options) === false) {
                        return false;
                    }
                }
                break;
            }

            return true;

        },

        nodeUpdateNode: function nodeUpdateNode(DOMNode1, DOMNode2, options) {
            options = options || {};

            var vNode1 = this.nodeToVNode(DOMNode1);
            var vNode2 = this.nodeToVNode(DOMNode2);

            var diff = this.vNodesDiff(vNode1, vNode2, options);

            this.vNodeDiffApply(vNode1, diff);

            if (options.test === true) {
                var vNode1Reread = this.nodeToVNode(DOMNode1);

                var updatedVSRereadUpdated = this.vNodesAreEqual(vNode1, vNode1Reread, options);
                var updatedVSOriginal = this.vNodesAreEqual(vNode1, vNode2, options);
                var rereadUpdatedVSOriginal = this.vNodesAreEqual(vNode1Reread, vNode2, options);

                if (updatedVSRereadUpdated === false
                    || updatedVSOriginal === false 
                    || rereadUpdatedVSOriginal === false) {
                    if (options.errorOnFail === true) {
                        throw "failed update";
                    } else {
                        console.log("failed update");
                    }
                }
            }

            if (options.returnVNode === true) {
                return vNode1;
            } else {
                return this;
            }

        },

        stringToNode: function stringToNode(htmlString) {

            var container = document.createElement("div");
            container.innerHTML = htmlString;
            return container.childNodes[0];

        }

    };

    
    function DOMDiffer(options) {
        options = options || {
            ignoreContainer: false,
            ignoreAttributes: [],
            ignoreAttributesWithPrefix: [
                "sizzle",
                "jquery"
            ],
            ignoreSubTreesWithAttributes: [
                "view-container"
            ]
        };
        this.options = options;
    }
    for (var k in proto) DOMDiffer.prototype[k] = proto[k];


    //export DOMDiffer for use in document
    return DOMDiffer;

}));