function updateUserRole(isPromote) {
    // 1. Get the content from the paragraph element
    const pElement = document.getElementById('userName');
    const userNameEle = pElement.innerText;
    const userName = userNameEle.split(" ")[0];
    
    // Example XHR PATCH Request
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", "/user/role", true);
    xhr.setRequestHeader("Content-Type", "application/json");

    // Send data directly without a textarea
    const data = JSON.stringify({ userName,  isPromote });
    xhr.send(data);

    xhr.onload = () => {
        window.alert(xhr.responseText);
    };
}
