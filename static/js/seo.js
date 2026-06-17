let inputs = document.querySelectorAll(".seo-input");
let settingsBtn = document.querySelector(".settings-btn");
let checkBoxes = document.querySelectorAll(".switch input");
let clearBtn = document.querySelector(".clear-btn");
let caseSelectButtons = document.querySelectorAll(".character-counter-container button");
let textArea = document.querySelector("textarea");
let textAreaCharCount = document.querySelector(".text-area-character-count");
let searchInput = document.querySelector(".search-input");
let seoTablesContainer = document.querySelector(".seo-tables-container");

function update_all_seo_variables() {
    let fields = ["clientName", "clientLocation", "clientState", "stateAbbreviated", "reAbbreviated", "solo"];
    let values = { clientName: "", clientLocation: "", clientState: "", stateAbbreviated: false, reAbbreviated: false, solo: true };
    for (let i = 0; i < 3; i++) {
        values[fields[i]] = inputs[i].value.replace(/\s+/g, ' ').trim();
    }
    values.solo = !checkBoxes[0].checked;
    values.stateAbbreviated = checkBoxes[1].checked;
    values.reAbbreviated = checkBoxes[2].checked;
    return (values.clientName && values.clientLocation && values.clientState) ? values : false;
}

function abbreviate_state(text) {
    let states = {
        "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
        "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
        "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
        "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
        "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
        "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
        "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
        "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
        "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
        "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
        "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
        "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
        "Wisconsin": "WI", "Wyoming": "WY"
    };
    for (let [state, abbreviation] of Object.entries(states)) {
        let regex = new RegExp(`\\b${state}\\b`, 'gi');
        text = text.replace(regex, abbreviation);
    }
    return text;
}

function reorganize_seo_titles(titles) {
    let grouped = {};
    let titleNameMap = {};
    let counter = 0;
    titles.forEach(item => {
        if (titleNameMap[item.titleName] === undefined) {
            titleNameMap[item.titleName] = counter;
            grouped[counter] = [];
            counter++;
        }
        let groupNumber = titleNameMap[item.titleName];
        grouped[groupNumber].push(item);
    });
    return grouped;
}

function generate_seo_titles(values, filter) {
    let clientName = values.clientName;
    let clientLocation = values.clientLocation;
    let clientState = values.stateAbbreviated ? abbreviate_state(values.clientState) : values.clientState;
    let realEstate = values.reAbbreviated ? "RE" : "Real Estate";
    let agentVerbiage = values.solo ? "Agent" : "Agents";
    let expertVerbiage = values.solo ? "Expert" : "Experts";
    let contactVerbiage = values.solo ? "Let's Connect" : "Contact Us";

    let titles = [
        { titleName: "Homepage", title: `${clientName} | ${clientLocation} ${realEstate} ${agentVerbiage}` },
        { titleName: "Homepage", title: `Top ${clientLocation} ${realEstate} ${agentVerbiage} | ${clientName}` },
        { titleName: "Homepage", title: `${clientName} | Your ${clientLocation} ${realEstate} ${expertVerbiage}` },

        { titleName: "About", title: `${clientName} | ${realEstate} ${agentVerbiage} Serving ${clientLocation}` },
        { titleName: "About", title: `Meet ${clientName} - Your ${clientLocation} ${realEstate} ${agentVerbiage}` },

        { titleName: "Team", title: `${clientName} | ${clientLocation} ${realEstate} Agents` },
        { titleName: "Team", title: `Meet the ${clientName} ${realEstate} Group` },
        { titleName: "Team", title: `${clientName} - Premier ${clientLocation} ${realEstate} Agents` },

        { titleName: "Portfolio", title: `${clientState} Homes for Sale & ${realEstate} Listings | ${clientName}` },
        { titleName: "Portfolio", title: `${clientState} Homes & Property Listings | ${clientName}` },
        { titleName: "Portfolio", title: `Find ${clientState} ${realEstate} Listings | ${clientName}` },
        { titleName: "Portfolio", title: `${clientState} Properties for Sale | ${clientName}` },

        { titleName: "Featured Properties", title: `Featured Properties for Sale in ${clientState} | ${clientName}` },
        { titleName: "Featured Properties", title: `Discover Properties for Sale in ${clientState} ${clientName}` },
        { titleName: "Featured Properties", title: `Explore Properties for Sale in ${clientState} | ${clientName}` },

        { titleName: "Past Transactions", title: `Recently Sold Properties in ${clientState} | ${clientName}` },
        { titleName: "Past Transactions", title: `${clientState} Homes Sold | Notable Transactions | ${clientName}` },
        { titleName: "Past Transactions", title: `Recently Sold Homes in ${clientState} by ${clientName}` },

        { titleName: "Home Valuation", title: `Free Home Valuation Tool - Instant ${clientState} Property Estimates | ${clientName}` },
        { titleName: "Home Valuation", title: `Free ${clientState} Home Valuation | ${clientName}` },
        { titleName: "Home Valuation", title: `Personalized ${clientState} Home Valuation | ${clientName}` },

        { titleName: "Neighborhoods", title: `Explore ${clientState} Neighborhoods - A Comprehensive Guide | ${clientName}` },
        { titleName: "Neighborhoods", title: `Explore ${clientState} Neighborhoods | ${clientName}` },
        { titleName: "Neighborhoods", title: `${clientState} Neighborhood Guides | ${clientName}` },
        { titleName: "Neighborhoods", title: `Find Your ${clientState} Dream Area | ${clientName}` },
        { titleName: "Neighborhoods", title: `Comprehensive Guide to ${clientState} Neighborhoods | ${clientName}` },

        { titleName: "Testimonials", title: `Client Testimonials & Success Stories | ${clientName}` },
        { titleName: "Testimonials", title: `Hear What Our Clients Say | ${clientName}` },
        { titleName: "Testimonials", title: `Client Testimonials & Success Stories | ${clientName}` },

        { titleName: "Buyer's Guide", title: `Home Buyers Guide - Tips & Insights for ${clientState} | ${clientName}` },
        { titleName: "Buyer's Guide", title: `Complete Guide for ${clientState} Home Buyers | ${clientName}` },
        { titleName: "Buyer's Guide", title: `${clientState} Home Buyers Guide | ${clientName}` },

        { titleName: "Seller's Guide", title: `Sell Your Home in ${clientState} - Expert Advice | ${clientName}` },
        { titleName: "Seller's Guide", title: `Expert Advice for Selling in ${clientState} | ${clientName}` },
        { titleName: "Seller's Guide", title: `Sell Your Home in ${clientState} - Expert Tips | ${clientName}` },

        { titleName: "Mortgage Calculator", title: `Mortgage Calculator | ${clientName} ${realEstate} ${agentVerbiage}` },

        { titleName: "Blog", title: `${clientLocation} ${realEstate} & Community Blog | ${clientName}` },
        { titleName: "Blog", title: `${clientLocation} ${realEstate} Blog | ${clientName}` },
        { titleName: "Blog", title: `${clientLocation} ${realEstate} Tips & More | ${clientName}` },

        { titleName: "Developments", title: `${clientState} Developments | ${clientName}` },
        { titleName: "Developments", title: `Latest Developments in ${clientState} | ${clientName}` },
        { titleName: "Developments", title: `New Property Developments in ${clientState} | ${clientName}` },

        { titleName: "Press & Media", title: `Press and Media | ${clientName}` },

        { titleName: "Vlog", title: `Vlog | ${clientName} ${realEstate} ${agentVerbiage}` },
        { titleName: "Vlog", title: `Featured Videos | ${clientName} ${realEstate} ${agentVerbiage}` },
        { titleName: "Vlog", title: `Property Videos | ${clientName} ${realEstate} ${agentVerbiage}` },

        { titleName: "Compass Concierge", title: `Compass Concierge | ${clientName} ${realEstate} ${agentVerbiage}` },

        { titleName: "Sotheby's Auction House", title: `Sotheby's Auction House | ${clientName} ${clientLocation} ${realEstate} ${agentVerbiage}` },
        { titleName: "About the Brand", title: `About the Brand | ${clientName} ${clientLocation} ${realEstate} ${agentVerbiage}` },

        { titleName: "Coldwell Banker Luxury", title: `Coldwell Banker Luxury | ${clientName} ${clientLocation} ${realEstate} ${agentVerbiage}` },

        { titleName: "Contact", title: `${contactVerbiage} | ${clientName} ${realEstate} ${agentVerbiage}` },
        { titleName: "Contact", title: `Get in Touch | ${clientName} ${realEstate} ${agentVerbiage}` },

        { titleName: "Page Not Found", title: `404 Page Not Found | ${clientName} ${realEstate} ${agentVerbiage}` },

        { titleName: "Privacy Policy", title: `Privacy Policy | ${clientName} ${realEstate} ${agentVerbiage}` }
    ];
    titles.forEach(title => {
        title.title = title.title.replace(/\s+/g, ' ').trim();
        title.characterCount = title.title.length;
    });
    if (filter) {
        titles = filter_seo_titles(titles, filter);
    }
    return reorganize_seo_titles(titles);
}

function filter_seo_titles(titles, filter) {
    return titles.reduce((result, item) => {
        if (item.titleName.toLowerCase().includes(filter.toLowerCase()) || item.title.toLowerCase().includes(filter.toLowerCase())) {
            result.push(item);
        }
        return result;
    }, []);
}

function generate_seo_tiles(groupedTitles) {
    seoTablesContainer.innerHTML = "";
    for (let [, group] of Object.entries(groupedTitles)) {
        let table = document.createElement("div");
        table.classList.add("table");
        table.innerHTML += `<div class="row"><h3>${group[0].titleName}</h3></div>`;
        group.forEach((title) => {
            table.innerHTML +=
                `<div class="row seo-title-container">
                    <div class="seo-length ${title.characterCount >= 45 && title.characterCount <= 60 ? "goods" : "not-goods"}">${title.characterCount}</div>
                    <div class="seo-title" onclick="copy_text(this)"><div class="seo-title-text to_copy_text">${title.title}</div><svg id='Copy_24' width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><rect width='24' height='24' stroke='none' fill='#000000' opacity='0'/><g transform="matrix(1 0 0 1 12 12)" ><path style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: var(--clr-primary-a50); fill-rule: nonzero; opacity: 1;" transform=" translate(-12, -12)" d="M 4 2 C 2.895 2 2 2.895 2 4 L 2 17 C 2 17.552 2.448 18 3 18 C 3.552 18 4 17.552 4 17 L 4 4 L 17 4 C 17.552 4 18 3.552 18 3 C 18 2.448 17.552 2 17 2 L 4 2 z M 8 6 C 6.895 6 6 6.895 6 8 L 6 20 C 6 21.105 6.895 22 8 22 L 20 22 C 21.105 22 22 21.105 22 20 L 22 8 C 22 6.895 21.105 6 20 6 L 8 6 z M 8 8 L 20 8 L 20 20 L 8 20 L 8 8 z" stroke-linecap="round" /></g></svg><span class="notification">Copy</span></div>
                </div>`;
        });
        seoTablesContainer.appendChild(table);
    }
    let copyNotifications = document.querySelectorAll(".notification");
    let seoTitles = document.querySelectorAll(".seo-title");
    seoTitles.forEach((seoTitle, i) => {
        seoTitle.addEventListener("mousemove", (e) => {
            copyNotifications[i].style.left = e.clientX + 'px';
            copyNotifications[i].style.top = e.clientY + 'px';
        });
    });
}

function seo_main() {
    let filter = searchInput.value.replace(/\s+/g, ' ').trim() || false;
    let values = update_all_seo_variables();
    if (values) {
        let titles = generate_seo_titles(values, filter);
        if (Object.keys(titles).length === 0) {
            seoTablesContainer.innerHTML = "No SEO Titles Found :(";
        }
        else {
            generate_seo_tiles(titles);
        }
    }
    else {
        seoTablesContainer.innerHTML =
            `<div class="default-message" style="text-align: center;">
                Fill in the fields marked with <span style="color: var(--clr-primary-a10);">*</span> above to generate
            </div>`;
    }
}

function titleCase(text) {
    let words = text.toLowerCase().split(" ");
    let titledWords = words.map(word => word.charAt(0).toUpperCase() + word.slice(1));
    return titledWords.join(" ");
}

function sentenceCase(text) {
    if (!text) {
        return "";
    }
    let sentences = text.toLowerCase().split(/([.?!]\s)/);
    return sentences.map((sentence) => {
        return sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }).join("");
}

inputs.forEach((input) => {
    input.addEventListener("input", (e) => {
        seo_main();
    });
});

checkBoxes.forEach(checkBox => {
    checkBox.addEventListener("change", (e) => {
        seo_main();
    });
});

clearBtn.addEventListener("click", (e) => {
    inputs[0].value = "";
    inputs[1].value = "";
    inputs[2].value = "";
    seo_main();
});

caseSelectButtons.forEach((button, i) => {
    button.addEventListener("click", (e) => {
        let cleanedText = textArea.value.replace(/\s+/g, ' ').trim();
        switch (i) {
            case 0:
                textArea.value = cleanedText.toLowerCase();
                break;
            case 1:
                textArea.value = cleanedText.toUpperCase();
                break;
            case 2:
                textArea.value = sentenceCase(cleanedText);
                break;
            case 3:
                textArea.value = titleCase(cleanedText);
                break;
        }
    });
});
textArea.addEventListener("input", (e) => {
    textAreaCharCount.innerText = e.target.value.replace(/\s+/g, ' ').trim().length;
});
searchInput.addEventListener("input", (e) => {
    seo_main();
});
window.addEventListener('load', () => {
    //     inputs[0].value = "Don Franco Ramos";
    //     inputs[1].value = "San Diego";
    //     inputs[2].value = "California";
    seo_main();
});