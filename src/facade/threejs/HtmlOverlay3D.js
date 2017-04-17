import {Object3D} from 'three'
import Object3DFacade from './Object3D'


/**
 * Defines a snippet of HTML content that will be positioned to line up with the object's
 * xyz as projected by the scene's camera. This is a convenient way to display tooltips,
 * labels, and pieces of UI that follow a given object around.
 */
class HtmlOverlay3DFacade extends Object3DFacade {
  constructor(parent) {
    super(parent, new Object3D())

    /**
     * Defines the HTML content to be rendered. The type/format of this value is dependent
     * on the wrapping implementation; for example the Canvas3D.jsx React-based wrapper will
     * expect a React element descriptor, while other wrappers might expect a HTML string.
     *
     * When using the React-based wrapper, the rendered React component will not be updated
     * when the overlay is repositioned, unless (a) the `html` element descriptor changes, or
     * (b) that element descriptor has a `shouldUpdateOnMove` prop.
     */
    this.html = null

    this.notifyWorld('addHtmlOverlay', this)
  }

  destructor() {
    this.notifyWorld('removeHtmlOverlay', this)
    super.destructor()
  }
}

export default HtmlOverlay3DFacade
