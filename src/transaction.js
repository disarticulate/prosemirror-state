const {Transform} = require("prosemirror-transform")
const {Mark} = require("prosemirror-model")
const {Selection} = require("./selection")

// ::- An editor state transaction, which can be applied to a state to
// create an updated state. Relies on its
// [`Transform`](#transform.Transform) superclass to track the changes
// to the document. Use [`EditorState.tr`](#state.EditorState.tr) to
// create an instance.
class Transaction extends Transform {
  constructor(state) {
    super(state.doc)
    this.origin = null
    // :: number
    // The timestamp associated with this transaction.
    this.time = Date.now()
    this.state = state
    this.curSelection = state.selection
    this.curSelectionAt = 0
    // :: bool
    // Whether the selection has been explicitly set for this
    // transaction.
    this.selectionSet = false
    // :: ?[Mark]
    // The stored marks in this transaction.
    this.storedMarks = state.storedMarks
    this.scroll = false
  }

  // :: Selection
  // The transform's current selection. This defaults to the
  // editor selection [mapped](#state.Selection.map) through the steps in
  // this transform, but can be overwritten with
  // [`setSelection`](#state.EditorTransform.setSelection).
  get selection() {
    if (this.curSelectionAt < this.steps.length) {
      this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionAt))
      this.curSelectionAt = this.steps.length
    }
    return this.curSelection
  }

  // :: (Selection) → EditorTransform
  // Update the transform's current selection. This will determine the
  // selection that the editor gets when the transform is applied.
  setSelection(selection) {
    this.curSelection = selection
    this.curSelectionAt = this.steps.length
    this.selectionSet = true
    this.storedMarks = null
    return this
  }

  // :: (Slice) → EditorTransform
  replaceSelection(slice) {
    let {from, to} = this.selection, startLen = this.steps.length
    this.replaceRange(from, to, slice)
    // Move the selection to the position after the inserted content.
    // When that ended in an inline node, search backwards, to get the
    // position after that node. If not, search forward.
    let lastNode = slice.content.lastChild, lastParent = null
    for (let i = 0; i < slice.openRight; i++) {
      lastParent = lastNode
      lastNode = lastNode.lastChild
    }
    selectionToInsertionEnd(this, startLen, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1)
    return this
  }

  // :: (Node, ?bool) → EditorTransform
  // Replace the selection with the given node or slice, or delete it
  // if `content` is null. When `inheritMarks` is true and the content
  // is inline, it inherits the marks from the place where it is
  // inserted.
  replaceSelectionWith(node, inheritMarks) {
    let {from, to} = this.selection, startLen = this.steps.length
    if (inheritMarks !== false)
      node = node.mark(this.state.storedMarks || this.doc.marksAt(from, to > from))
    this.replaceRangeWith(from, to, node)
    selectionToInsertionEnd(this, startLen, node.isInline ? -1 : 1)
    return this
  }

  // :: () → EditorTransform
  // Delete the selection.
  deleteSelection() {
    let {from, to} = this.selection
    return this.deleteRange(from, to)
  }

  // :: (string, from: ?number, to: ?number) → EditorTransform
  // Replace the given range, or the selection if no range is given,
  // with a text node containing the given string.
  insertText(text, from, to = from) {
    if (from == null) {
      if (!text) return this.deleteSelection()
      return this.replaceSelectionWith(this.state.schema.text(text), true)
    } else {
      if (!text) return this.deleteRange(from, to)
      let node = this.state.schema.text(text, this.state.storedMarks || this.doc.marksAt(from, to > from))
      return this.replaceRangeWith(from, to, node)
    }
  }

  // :: (string) → Transaction
  // Set an origin string for this transaction.
  setOrigin(origin) {
    this.origin = origin
    return this
  }

  // :: (number) → Transaction
  // Update the timestamp for the transaction.
  setTime(time) {
    this.time = time
    return this
  }

  // :: (Plugin, any) → Transaction
  // Store a plugin-local value in this transaction.
  set(plugin, value) {
    this[plugin.key] = value
    return this
  }

  // :: (Plugin) → any
  // Retrieve the plugin-local value for a given plugin.
  get(plugin) {
    return this[plugin.key]
  }

  // :: () → Transaction
  // Indicate that the editor should scroll the selection into view
  // when updated to the state produced by this transaction.
  scrollIntoView() {
    this.scroll = true
    return this
  }

  // :: (Mark) → Transaction
  // Add a mark to the set of stored marks.
  addStoredMark(mark) {
    this.storedMarks = mark.addToSet(this.storedMarks || currentMarks(this.doc, this.selection))
    return this
  }

  // :: (Mark) → Transaction
  // Remove a mark from the set of stored marks.
  removeStoredMark(mark) {
    this.storedMarks = mark.removeFromSet(this.storedMarks || currentMarks(this.doc, this.selection))
    return this
  }
}
exports.Transaction = Transaction

function selectionToInsertionEnd(tr, startLen, bias) {
  if (tr.steps.length == startLen) return
  let map = tr.mapping.maps[tr.mapping.maps.length - 1], end
  map.forEach((_from, _to, _newFrom, newTo) => end = newTo)
  if (end != null) tr.setSelection(Selection.near(tr.doc.resolve(end), bias))
}

function currentMarks(doc, selection) {
  return selection.head == null ? Mark.none : doc.marksAt(selection.head)
}
