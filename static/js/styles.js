seoTablesContainer.addEventListener("scroll", () => {
    if (seoTablesContainer.scrollHeight - seoTablesContainer.scrollTop - seoTablesContainer.clientHeight < 1) {
        document.querySelector(".tables-and-search-container").classList.add("hide-after");
    }
    else {
        document.querySelector(".tables-and-search-container").classList.remove("hide-after");
    }
});

videos_container.addEventListener("scroll", () => {
    if (videos_container.scrollHeight - videos_container.scrollTop - videos_container.clientHeight < 1) {
        document.querySelector("#vlog-tab").classList.add("hide-after");
    }
    else {
        document.querySelector("#vlog-tab").classList.remove("hide-after");
    }
});

function copy_text(el) {
    navigator.clipboard.writeText(el.querySelector(".to_copy_text").innerText);
    let notification = el.querySelector(".notification");
    notification.innerText = "Copied";
    notification.classList.add("fade-away");
    setTimeout(() => {
        notification.innerText = "Copy";
        notification.classList.remove("fade-away");
    }, 1200);
}

function video_mouse_move(e) {
    let notification = e.srcElement.querySelector(".notification");
    notification.style.left = e.clientX + 'px';
    notification.style.top = e.clientY + 'px';
}