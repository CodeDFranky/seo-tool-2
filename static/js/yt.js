// === DOM Elements ===
let channel_form = document.querySelector("#channel_form");
let youtube_url_field = document.querySelector("#youtube_url");
let batch_size_input = document.querySelector("#batch_size_input");
let videos_container = document.querySelector(".videos_container");
let load_more_button = document.querySelector("#load_more");
let image_batch_download_button = document.querySelector(
    ".image_batch_download_button"
);
let image_select_all_button = document.querySelector(
    ".image_select_all_button"
);
let all_check_boxes;

// === Global State ===
let BATCH_SIZE;
let CACHE_KEY;
let ALL_VIDEO_IDS = [];
let CURRENT_INDEX = 0;
let BATCH_IS_RENDING = false;

function clear_cache() {
    localStorage.removeItem("yt_cache_keys");
    localStorage.removeItem("yt_video_ids");
    console.log("Cache cleared successfully.");
}

// === Clean YouTube URL ===
function clean_youtube_url(url) {
    let clean_url = url.split("#")[0];

    let video_pattern =
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/;
    if (video_pattern.test(clean_url)) {
        let video_id = clean_url.match(video_pattern)[2];
        return `https://www.youtube.com/watch?v=${video_id}`;
    }

    let playlist_pattern =
        /^https?:\/\/(www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/;
    if (playlist_pattern.test(clean_url)) {
        let playlist_id = clean_url.match(playlist_pattern)[2];
        return `https://www.youtube.com/playlist?list=${playlist_id}`;
    }

    let channel_pattern =
        /^https?:\/\/(www\.)?youtube\.com\/@([a-zA-Z0-9_.-]+)\/videos/;
    if (channel_pattern.test(clean_url)) {
        let channel_id = clean_url.match(channel_pattern)[2];
        return `https://www.youtube.com/@${channel_id}/videos`;
    }

    let shorts_pattern =
        /^https?:\/\/(www\.)?youtube\.com\/shorts\/@([a-zA-Z0-9_-]{11})/;
    if (shorts_pattern.test(clean_url)) {
        let shorts_id = clean_url.match(shorts_pattern)[2];
        return `https://www.youtube.com/watch?v=${shorts_id}`;
    }

    let channel_shorts_pattern =
        /^https?:\/\/(www\.)?youtube\.com\/@([a-zA-Z0-9_.-]+)\/shorts/;
    if (channel_shorts_pattern.test(clean_url)) {
        let channel_id = clean_url.match(channel_shorts_pattern)[2];
        return `https://www.youtube.com/@${channel_id}/shorts`;
    }

    return null;
}

// === Validate YouTube Link ===
function is_valid_youtube_link(url) {
    let cleaned_url = clean_youtube_url(url);
    return cleaned_url;
}

// === Reset select all button text ===
function reset_select_button(el = undefined) {
    image_select_all_button.textContent = "Select all";

    all_check_boxes = document.querySelectorAll(
        '.video_container input[type="checkbox"]'
    );
    let checked_count = Array.from(all_check_boxes).filter(
        (cb) => cb.checked
    ).length;

    if (checked_count > 0) {
        image_batch_download_button.classList.add("active");
        let label = `Download ${checked_count} Thumbnail${checked_count > 1 ? "s" : ""
            }`;
        image_batch_download_button.textContent = label;
    } else {
        image_batch_download_button.classList.remove("active");
        image_batch_download_button.textContent = "Download 1 Thumbnail";
    }
}
// === Download Thumbnail Image ===
function download_image(id, url, i) {
    fetch(url, { mode: "cors" })
        .then((response) => response.blob())
        .then((blob) => {
            let blobUrl = URL.createObjectURL(blob);
            let extension = url.split(".").pop().split(/[#?]/)[0];
            let a = document.createElement("a");
            a.href = blobUrl;
            a.download = `v${i + 1}_${id}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        })
        .catch((err) => console.error("Download failed", err));
}

// === Utility Function for copy notification popup on hover ===
function video_mouse_move(event) {
    let notification = event.currentTarget.querySelector(".notification");
    if (notification) {
        let { offsetX, offsetY } = event;
        notification.style.left = `${offsetX + 10}px`;
        notification.style.top = `${offsetY + 10}px`;
    }
}

// === Clean Cache (where necessary) ===
function clean_invalid_cache() {
    let cache_keys = JSON.parse(localStorage.getItem("yt_cache_keys")) || {};
    let validCache = {};

    for (let [url, data] of Object.entries(cache_keys)) {
        if (data.cache_key && data.added_at) {
            validCache[url] = data;
        } else {
            console.log(`Deleting invalid cache for URL: ${url}`);
        }
    }
    localStorage.setItem("yt_cache_keys", JSON.stringify(validCache));
    console.log("Cache cleaned. Current valid cache:");
    console.table(validCache);
}

// === Render Video to DOM ===
function render_video_to_dom(current_no_of_video_containers, video, placeholder_id, i) {
    let video_element = document.createElement("div");
    video_element.classList.add("video_container");
    // video_element.innerHTML = `
    // <input type="checkbox" name="to_dl" id="${video.video_id}" class="to_dl_checkbox" onchange="reset_select_button(this)">
    // <a href="#" onclick="download_image('${video.thumbnail}', ${i})" class="download_image_btn">
    //     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    //         <path d="M512 666.5L367.2 521.7l36.2-36.2 83 83V256h51.2v312.5l83-83 36.2 36.2L512 666.5zm-204.8 50.3V768h409.6v-51.2H307.2z" />
    //     </svg>
    // </a>
    // <div class="video_title_container" onmousemove="video_mouse_move(event)" onclick="copy_text(this)">
    //     <h3 class="to_copy_text">${video.title}</h3>
    //     <span class="notification">Copy</span>
    // </div>
    // <div class="video_embed_url_container" onmousemove="video_mouse_move(event)" onclick="copy_text(this)">
    //     <iframe src="${video.embed_url}" title="${video.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    // </div>
    // <div class="video_thumbnail_container">
    //     <img src="${video.thumbnail}" loading="lazy">
    // </div>`;

    let index_with_offset = i + current_no_of_video_containers;

    video_element.innerHTML = `
        <input type="checkbox" name="to_dl" id="${video.video_id}" class="to_dl_checkbox" onchange="reset_select_button(this)">
        <a href="#" onclick="download_image('${video.video_id}','${video.thumbnail}', ${index_with_offset})" class="download_image_btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
                <path d="M512 666.5L367.2 521.7l36.2-36.2 83 83V256h51.2v312.5l83-83 36.2 36.2L512 666.5zm-204.8 50.3V768h409.6v-51.2H307.2z" />
            </svg>
        </a>
        <div class="video_title_container" onmousemove="video_mouse_move(event)" onclick="copy_text(this)">
            <h3 class="to_copy_text">${video.title}</h3>
            <span class="notification">Copy</span>
        </div>
        <div class="video_embed_url_container" onmousemove="video_mouse_move(event)" onclick="copy_text(this)">
            <div class="to_copy_text">${video.embed_url}<span>?autoplay=1<span></div>
            <span class="notification">Copy</span>
        </div>
        <div class="video_thumbnail_container">
            <img src="${video.thumbnail}" data-video-title="v${index_with_offset + 1}_${video.video_id}" loading="lazy">
        </div>`;

    let existing_placeholder = document.getElementById(placeholder_id);
    if (existing_placeholder) {
        videos_container.replaceChild(video_element, existing_placeholder);
    }

    if (i === 0) {
        video_element.scrollIntoView({ behavior: "smooth", block: "end" });
    }
}

// === Render Videos from Cached or API ===
function render_next_batch() {
    let remaining = ALL_VIDEO_IDS.length - CURRENT_INDEX;
    if (remaining <= 0) return;

    let next_batch = ALL_VIDEO_IDS.slice(
        CURRENT_INDEX,
        CURRENT_INDEX + BATCH_SIZE
    );

    let current_no_of_video_containers = videos_container.querySelectorAll(".video_container").length;

    next_batch.forEach((video_id, i) => {
        let placeholder_id = `video_${CURRENT_INDEX + i}`;
        let placeholder = document.createElement("div");
        placeholder.classList.add("video_placeholder");
        placeholder.setAttribute("id", placeholder_id);
        placeholder.textContent = "Loading content...";
        videos_container.appendChild(placeholder);

        let cached_video_info = JSON.parse(localStorage.getItem(video_id));

        if (cached_video_info) {
            render_video_to_dom(current_no_of_video_containers, cached_video_info, placeholder_id, i);
        } else {
            fetch("/api/fetch_video_info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ video_id }),
            })
                .then((res) => res.json())
                .then((video_info) => {
                    if (video_info.error) {
                        console.error(`Failed to fetch video info: ${video_info.error}`);
                        return;
                    }
                    localStorage.setItem(video_id, JSON.stringify(video_info));
                    render_video_to_dom(current_no_of_video_containers, video_info, placeholder_id, i);
                })
                .catch((error) => console.error("Error fetching video info:", error));
        }
    });

    CURRENT_INDEX += next_batch.length;
}

// === Fetch Next Batch of video IDs ===
function load_next_batch_of_ids() {
    if (BATCH_IS_RENDING || !CACHE_KEY) return;

    BATCH_IS_RENDING = true;

    let page = Math.floor(CURRENT_INDEX / BATCH_SIZE) + 1;

    if (page == 1)
        videos_container.innerHTML = `<img class="loader" src="../static/resources/loader.gif" alt="loading">`;

    fetch("/api/fetch_video_ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            cache_key: CACHE_KEY,
            page,
            batch_size: BATCH_SIZE,
        }),
    })
        .then((res) => res.json())
        .then((data) => {
            if (data.error) {
                console.error(`Server error: ${data.error}`);
                return;
            }

            if (data.ids.length === 0 && (data.has_more || !data.fetch_completed)) {
                setTimeout(() => load_next_batch_of_ids(), 1000);
                return;
            }

            ALL_VIDEO_IDS.push(...data.ids);
            localStorage.setItem("yt_video_ids", JSON.stringify(ALL_VIDEO_IDS));

            if (CURRENT_INDEX === 0) {
                videos_container.innerHTML = "";
            }

            render_next_batch();
            load_more_button.classList.toggle(
                "hidden",
                !(data.has_more && data.fetch_completed)
            );
        })
        .catch((error) => console.error("Error fetching video URLs:", error))
        .finally(() => (BATCH_IS_RENDING = false));
}

// === On Form Submit ===
channel_form.addEventListener("submit", (e) => {
    e.preventDefault();

    reset_select_button();
    clean_invalid_cache();

    ALL_VIDEO_IDS = [];
    CURRENT_INDEX = 0;
    BATCH_SIZE = parseInt(batch_size_input.value) || 6;

    let youtube_url = is_valid_youtube_link(youtube_url_field.value.trim());

    if (!youtube_url) {
        alert("Please enter a valid YouTube URL.");
        return;
    }
    console.log("Submitted URL is: ", youtube_url);

    let cache_keys = JSON.parse(localStorage.getItem("yt_cache_keys")) || {};
    console.log("Currently cached keys");
    console.table(cache_keys);

    let request_payload = { youtube_url };
    let existing_cache_key = cache_keys[youtube_url];
    if (existing_cache_key) {
        console.log("URL is already cached");
        request_payload.cache_key = existing_cache_key.cache_key;
    }

    fetch("/api/start-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request_payload),
    })
        .then((res) => res.json())
        .then((data) => {
            CACHE_KEY = data.cache_key;

            if (existing_cache_key?.cache_key != CACHE_KEY) {
                console.log("Adding URL to cache");
                cache_keys[youtube_url] = {
                    cache_key: CACHE_KEY,
                    added_at: Date.now(),
                };
                localStorage.setItem("yt_cache_keys", JSON.stringify(cache_keys));
                console.table(cache_keys);
            }

            let entries = Object.entries(cache_keys);
            if (entries.length > 10) {
                console.log("cached URLS > 10, deleting 1");
                entries.sort((a, b) => b[1].added_at - a[1].added_at);
                let [oldestUrl] = entries[entries.length - 1];
                delete cache_keys[oldestUrl];
            }

            load_next_batch_of_ids();
        })
        .catch((error) => console.error("Error:", error));
});

// === Load More Button Press ===
load_more_button.addEventListener("click", () => {
    load_next_batch_of_ids();
});

// === Select All Button Press ===
image_select_all_button.addEventListener("click", () => {
    all_check_boxes = document.querySelectorAll(
        '.video_container input[type="checkbox"]'
    );
    let all_checked = Array.from(all_check_boxes).every(
        (check_box) => check_box.checked
    );

    all_check_boxes.forEach((check_box) => {
        check_box.checked = !all_checked;
    });

    if (all_checked) {
        image_select_all_button.textContent = "Select All";
        image_batch_download_button.textContent = "";
        image_batch_download_button.classList.remove("active");
    } else {
        image_select_all_button.textContent = "Deselect All";
        image_batch_download_button.textContent = `Download ${Array.from(all_check_boxes).filter((check_box) => check_box.checked)
            .length
            } Thumbnails`;
        image_batch_download_button.classList.add("active");
    }
});

// === Download All Button Press ===
// image_batch_download_button.addEventListener("click", () => {
//     to_download_buttons = document.querySelectorAll(
//         ".video_container .download_image_btn"
//     );
//     console.log(to_download_buttons);
//     to_download_buttons.forEach((btn) => {
//         btn.click();
//     });
// });

// === Download All Button Press ===
// image_batch_download_button.addEventListener("click", async () => {
//     let to_download_buttons = document.querySelectorAll(
//         ".video_container .download_image_btn"
//     );
//     let image_urls = [];

//     to_download_buttons.forEach((btn) => {
//         let thumbnailContainer = btn.parentElement.querySelector(
//             ".video_thumbnail_container"
//         );
//         if (!thumbnailContainer) return;
//         let img = thumbnailContainer.querySelector("img");
//         if (img) image_urls.push(img.src);
//     });

//     if (!image_urls.length) return;

//     if (image_urls.length === 1) {
//         let link = document.createElement("a");
//         link.href = image_urls[0];
//         link.download = image_urls[0].split("/").pop();
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//         return;
//     }

//     let res = await fetch("/download-thumbnails", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ urls: image_urls }),
//     });

//     if (!res.ok) {
//         alert("Failed to generate ZIP.");
//         return;
//     }

//     let blob = await res.blob();
//     let url = URL.createObjectURL(blob);

//     let link = document.createElement("a");
//     link.href = url;
//     link.download = "thumbnails.zip";
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//     URL.revokeObjectURL(url);
// });

// === Download All Button Press ===
image_batch_download_button.addEventListener("click", async () => {
    let to_download_buttons = document.querySelectorAll(
        ".video_container .download_image_btn"
    );

    let image_items = [];

    to_download_buttons.forEach((btn) => {
        let thumbnailContainer = btn.parentElement.querySelector(
            ".video_thumbnail_container"
        );
        if (!thumbnailContainer) return;
        let img = thumbnailContainer.querySelector("img");
        if (img) {
            let title = img.getAttribute("data-video-title") || "thumbnail";
            image_items.push({
                url: img.src,
                title: title
            });
        }
    });

    if (!image_items.length) return;

    if (image_items.length === 1) {
        let item = image_items[0];
        let link = document.createElement("a");
        link.href = item.url;

        let ext = item.url.split(".").pop().split("?")[0];
        link.download = `${item.title}.${ext}`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
    }

    let res = await fetch("/download-thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: image_items }),
    });

    if (!res.ok) {
        alert("Failed to generate ZIP.");
        return;
    }

    let blob = await res.blob();
    let url = URL.createObjectURL(blob);

    let link = document.createElement("a");
    link.href = url;
    link.download = "dfr-vlog-tool-thumbnails.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

