export default class Proxy {

  /**
  * @param {Event} event
  */
  handleEvent(event) {
    const button = /**@type {HTMLButtonElement}*/(event.target);
    console.log("Remove event listener button clicked");
    button.removeEventListener('click', this);
  }
}
