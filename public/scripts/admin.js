function updateUserRole(isPromote, email) {
    // Example XHR PATCH Request
    const xhr = new XMLHttpRequest();
    
    xhr.open("PATCH", "/user/role", true);
    xhr.setRequestHeader("Content-Type", "application/json");

    const data = JSON.stringify({ email,  isPromote });
    xhr.send(data);

    xhr.onload = () => {
        window.alert(xhr.responseText);
    };
}
