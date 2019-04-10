import {LN} from './static/ln/base-datalet-ln.js';
import {importModule} from '../lib/vendors/import_polyfill/import_polyfill.js';

export default class BaseDatalet extends HTMLElement {

    constructor(component) {
        // If you define a constructor, always call super() first as it is required by the CE spec.
        super();

        this.component = component;
        this.currentDocument = document.querySelector(`link[href*="${this.component}"]`).import;
        this.baseUri = this.currentDocument.baseURI.substring(0, this.currentDocument.baseURI.lastIndexOf("/") + 1);
        this.dynamic_import_support = this.get_dynamic_import();

        // Create a Shadow DOM using our template
        this.shadow_root = this.attachShadow({mode: 'open'}); // con mode open è possibile accedere agli elementi DOM all'interno dello shadow DOM

    }

    connectedCallback() {
        this.data_url = this.getAttribute("data-url");
        this.selected_fields = this.getAttribute("selectedfields");
        this.filters = this.getAttribute("filters");
        this.aggregators = this.getAttribute("aggregators");
        this.orders = this.getAttribute("orders");
        this.datalettitle = this.getAttribute("datalettitle");
        this.description = this.getAttribute("description");
        this.cache = this.getAttribute("data");

        const base_document = document.querySelector(`link[href*="${this.component}"]`).import.querySelector('link[rel="import"]').import;
        const base_template = base_document.querySelector('#base-datalet');
        const base_instance = base_template.content.cloneNode(true); // clona (con true anche i figli) il template
        const base_datalet_baseUri = base_document.baseURI.substring(0, base_document.baseURI.lastIndexOf("/") + 1);

        //GET DERIVED CLASS TEMPLATE
        let template = this.template();

        //APPEND SCRIPTS
        this.load_script([{template: base_instance, baseURI: base_datalet_baseUri}, {
            template: template,
            baseURI: this.baseUri
        }]);

        //APPEND TEMPLATE TO SHADOW ROOT
        this.shadow_root.appendChild(this.replace_img_path(template));
        this.shadow_root.appendChild(this.replace_img_path(base_instance, base_datalet_baseUri));

        //SET BEHAVIOUR
        this.handle_behaviour();

        //ADD DATALET INFO AND LISTENER
        this.add_datalet_info();
        this.add_listeners();

        //SET EXPORT MENU
        this.set_export_menu();

        this.translate();
    }

    attributeChangedCallback() {
        console.log('attributeChangedCallback');
    }

    disconnectedCallback() {
        //todo remove event listeners ??
        this.shadow_root.innerHTML = ''; //svuota lo shadow DOM
    }

    async set_behaviours(module, config) {
        config = config || [0, 0, 0, 0];
        let modules = [];

        try
        {
            for (let i = 0; i < module.length; i++)
            {
                let m;

                if (typeof module[i] === 'string')
                    m = await this.import_module(module[i]);
                else
                    m = module[i];

                modules.push(m);
            }

            this.requestData   = modules[config[0]].requestData;
            this.selectData    = modules[config[1]].selectData;
            this.filterData    = modules[config[2]].filterData;
            this.transformData = modules[config[3]].transformData;

            this.work_cycle();

        } catch (e) {
            console.log(e);
        }
    }

    async work_cycle() {
        try
        {
            let data;

            if (!this.cache)
            {
                this.shadow_root.querySelector('#live').classList.remove("cache");

                let json_results = await this.requestData(this.data_url);
                data = this.selectData(json_results, this.data_url);
                this.CSV = data;
                data = this.filterData(data, this.selected_fields, this.filters, this.aggregators, this.orders);
                this.FCSV = data;
            } else {
                this.shadow_root.querySelector('#live').classList.add("cache");

                data = JSON.parse(this.cache);
                this.FCSV = data;
            }

            if(this.shadow_root.querySelector('#base_datalet_loader'))
                this.shadow_root.querySelector('#base_datalet_loader').style.display = 'none';
            this.render(this.transformData(data, this.selected_fields));

        } catch (e) {
            this.parse_error(e);
            this.render_error(e);
        }
    }

    async import_module(url) {
        //TODO : something better than this [exclude define]
        let define = window.define;
        window.define = undefined;
        let mod = await this.dynamic_import_support(this.build_uri(url));
        window.define = define;
        return mod;
    }

    render() {
        throw new Error("Render method not implemented");
    }

    load_script(templates) {
        templates.forEach((t) => {
            let scripts = t.template.querySelectorAll('link, script'); //'script, link'

            for (let i = 0; i < scripts.length; i++) {
                let attribute = scripts[i].tagName === 'SCRIPT' ? 'src' : 'href';
                scripts[i].setAttribute(attribute, this.build_uri(scripts[i].getAttribute(attribute), t.baseURI));
            }
        });
    }

    handle_behaviour() {
        throw new Error("Render method not implemented");
    }

    async add_datalet_info() {
        this.shadow_root.querySelector('#datalet_title').innerHTML = this.datalettitle;
        this.shadow_root.querySelector('#datalet_title').setAttribute("title", this.datalettitle);
        if(this.description) {
            this.shadow_root.querySelector('#datalet_description').innerHTML = this.description;
            this.shadow_root.querySelector('#datalet_description').setAttribute("title", this.description);
        }
        else
            this.shadow_root.querySelector('#datalet_description').style.display = "none";

        if (this.data_url) {
            let data_source = this.shadow_root.querySelector('#data_source');
            let data_link = this.shadow_root.querySelector('#data_link');

            let urlSource = this.data_url.split("/")[0] + "//" + this.data_url.split("/")[2];

            data_source.innerHTML = urlSource;
            data_source.setAttribute("href", urlSource);

            // INFER DATASET URL

            // COCREATION
            if (this.data_url.indexOf("/cocreation/") > -1) {
                data_link.setAttribute("href", urlSource + "/cocreation/data-room-list");
            }
            // ?
            else if (this.data_url.indexOf("/records/") > -1) {
                let i;
                if (this.data_url.indexOf("&") > -1)
                    i = this.data_url.indexOf("&");
                else
                    i = this.data_url.length;

                data_link.setAttribute("href", urlSource + "/explore/dataset/" + this.data_url.substring(this.data_url.indexOf("=") + 1, i));
            }
            // CKAN
            else if (this.data_url.indexOf("datastore_search?resource_id") > -1) {
                let response = await this.ajax_request("POST", this.data_url.replace("datastore_search?resource_id", "resource_show?id"), 'responseText', JSON.parse);

                if (response.package_id)
                    data_link.setAttribute("href", urlSource + "/dataset/" + response.result.package_id + "/resource/" + response.result.id);
                else
                    data_link.setAttribute("href", response.result.url.substring(0, response.result.url.indexOf("/download")));
            }
            else {
                data_link.setAttribute("href", this.data_url);
            }
        }
        else {
            this.shadow_root.querySelector('#datalet_source').style.display = "none";
        }
    }

    set_export_menu() {
        if(this.cache)
            this.shadow_root.querySelector('#csv-action').style.display = 'none';

        if(typeof ODE === 'undefined' && typeof parent.ODE === 'undefined')
        {
            this.shadow_root.querySelector('#link').style.display = 'none';
            this.shadow_root.querySelector('#myspace-action').style.display = 'none';
            this.shadow_root.querySelector('#social').style.visibility = 'hidden';
        }

        if(this.hasAttribute("disable_html_export") || this.hasAttribute("disable_html")) //todo ??
            this.shadow_root.querySelector('#embed').style.display = 'none';

        if(this.hasAttribute("disable_link"))
            this.shadow_root.querySelector('#link').style.display = 'none';

        if(this.hasAttribute("disable_my_space"))
            this.shadow_root.querySelector('#myspace-action').style.display = 'none';

        if(typeof this.export_to_img_doc !== 'undefined' && !this.export_to_img_doc)
        {
            this.shadow_root.querySelector('#img-action').style.display = 'none';
            this.shadow_root.querySelector('#doc-action').style.display = 'none';
        }

        if(this.hasAttribute("hide_export")) {
            this.shadow_root.querySelector('#embed').style.visibility = 'hidden';
            this.shadow_root.querySelector('#link').style.visibility = 'hidden';
            this.shadow_root.querySelector('#export_menu').style.visibility = 'hidden';
        }
        if(this.hasAttribute("hide_fullscreen"))
            this.shadow_root.querySelector('#fullscreen').style.visibility = 'hidden';
        if(this.hasAttribute("hide_share"))
            this.shadow_root.querySelector('#social').style.visibility = 'hidden';
    }

    add_listeners() {
        this.shadow_root.querySelector('#live').addEventListener('click', () => {this.requestLiveData()});

        this.shadow_root.querySelector('#fullscreen').addEventListener('click', () => {this.fullscreen()});
        this.shadow_root.querySelector('#embed').addEventListener('click', () => {this.copy_html()});
        this.shadow_root.querySelector('#link').addEventListener('click', () => {this.copy_link()});
        this.shadow_root.querySelector('#export_menu').addEventListener('click', () => {this.save_as()});
        this.shadow_root.querySelector('#img-action').addEventListener('click', () => {this.save_as_image()});
        this.shadow_root.querySelector('#doc-action').addEventListener('click', () => {this.save_as_doc()});
        this.shadow_root.querySelector('#csv-action').addEventListener('click', () => {this.save_as_csv()});
        this.shadow_root.querySelector('#csv_filtered-action').addEventListener('click', () => {this.save_as_csv2()});
        this.shadow_root.querySelector('#myspace-action').addEventListener('click', () => {this.import_myspace()});
        this.shadow_root.querySelectorAll('.close').forEach(function(elem) {
            elem.addEventListener('click', (e) => {this.close(e)});
        }.bind(this));

        this.shadow_root.querySelector('#preview_width').addEventListener('change', () => {this.preview_resize()});
        this.shadow_root.querySelector('#preview_height').addEventListener('change', () => {this.preview_resize()});
        this.shadow_root.querySelector('#preview_set_default').addEventListener('change', (e) => {this.preview_defaults(e)});
        this.shadow_root.querySelector('#preview_export').addEventListener('click', () => {this.save_as_png()});

        this.shadow_root.querySelector('#facebook').addEventListener('click', (e) => {this.share_on_fb(e)});
        this.shadow_root.querySelector('#twitter').addEventListener('click', (e) => {this.share_on_twitter(e)});
    }

    // LISTENER

    fullscreen() {
        this.shadow_root.querySelector('#fullscreen-placeholder').style.display = 'block';

        if(!this.hasPreview) {
            let html_obj = this.get_html();
            let iframe = document.createElement('iframe');
            iframe.setAttribute("frameborder", "0");
            iframe.setAttribute("id", 'fullscreen-iframe');
            iframe.setAttribute("srcdoc", html_obj.script + html_obj.style + html_obj.datalet_definition + html_obj.component);
            this.shadow_root.querySelector('#fullscreen-container').appendChild(iframe);
            this.hasPreview = true;
        }
    }

    copy_html() {
        let embed = this.shadow_root.querySelector('#embed');
        embed.setAttribute("data-balloon", LN.translate("copied"));
        setTimeout(function(){ embed.setAttribute("data-balloon", LN.translate("copy_html")); }, 3000);

        let html_obj = this.get_html();
        let datalet = (html_obj.script + html_obj.datalet_definition + html_obj.component);
        let iframe = document.createElement('iframe');
        iframe.setAttribute("style", "width:100%;height:100%;min-height:498px;padding:0;margin:0;border:0;");
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("scrolling", "no");
        iframe.setAttribute("srcdoc", datalet);

        let temp = document.createElement("input")
        document.getElementsByTagName("body")[0].appendChild(temp);
        temp.value = iframe.outerHTML;
        temp.select();
        document.execCommand("copy");
        document.getElementsByTagName("body")[0].removeChild(temp);
    }

    copy_link() {
        let link = this.shadow_root.querySelector('#link');
        link.setAttribute("data-balloon", LN.translate("copied"));
        setTimeout(function(){link.setAttribute("data-balloon", LN.translate("copy_link")); }, 3000);

        let datalet_id = this.get_datalet_id();
        let base_url = ODE.ow_url_home;
        let landing_page_url = base_url + 'datalet/' + datalet_id;

        let temp = document.createElement("input")
        document.getElementsByTagName("body")[0].appendChild(temp);
        temp.value = landing_page_url;
        temp.select();
        document.execCommand("copy");
        document.getElementsByTagName("body")[0].removeChild(temp);
    }

    save_as() {
        this.shadow_root.querySelector('#save_as-placeholder').style.display = 'block';
    }

    close(e) {
        this.shadow_root.querySelector('#' + e.currentTarget.id.split('-')[0] + '-placeholder').style.display = 'none';
    }

    // MENU

    save_as_image() {
        this.shadow_root.querySelector('#save_as-placeholder').style.display = 'none';
        this.shadow_root.querySelector('#img-placeholder').style.display = 'block';

        if(!this.hasImgPreview) {
            let html_obj = this.get_html();
            let iframe = document.createElement('iframe');
            iframe.setAttribute("frameborder", "0");
            iframe.setAttribute("id", 'img-iframe');
            iframe.setAttribute("srcdoc", html_obj.script + html_obj.style + html_obj.datalet_definition + html_obj.component);
            this.shadow_root.querySelector('#img-preview').appendChild(iframe);
            this.hasImgPreview = true;
        }
    }

    async save_as_doc() {
        this.shadow_root.querySelector('#save_as-placeholder').style.display = 'none';

        if (this.data_url.indexOf("datastore_search?resource_id") > -1) // todo
        {
            let docx = await this.import_module('../lib/vendors/docx/index.js');

            let url = this.data_url.replace("datastore_search?resource_id", "resource_show?id");

            let res = await this.ajax_request("GET", url, 'responseText', JSON.parse,
                [["Accept", "application/json, text/javascript, */*; q=0.01"]], null, null);

            const doc = new Document();

            doc.addParagraph(new Paragraph(`Datalet Name : ${this.component}`));
            doc.addParagraph(new Paragraph(`Datalet Title : ${this.datalettitle}`));
            doc.addParagraph(new Paragraph(`Datalet Description : ${this.description}`));
            doc.addParagraph(new Paragraph(`Dataset Creation Date : ${res.result.created}`));
            doc.addParagraph(new Paragraph(`Dataset Format : ${res.result.format}`));
            doc.addParagraph(new Paragraph(`Dataset Last Modified : ${res.result.last_modified}`));
            doc.addParagraph(new Paragraph(`Dataset Url : ${res.result.url}`));
            doc.addParagraph(new Paragraph(`Dataset API : ${this.data_url}`));
            doc.createImage(await this.create_image(this.shadow_root.querySelector('svg')));

            const packer = new Packer();
            let blob = await packer.toBlob(doc);

            let downloadUrl = window.URL.createObjectURL(blob);
            let download = document.createElement("a");
            download.href = downloadUrl;
            download.download = `${this.component}.docx`;
            document.body.appendChild(download);
            download.click();
            document.body.removeChild(download);
        }

        /*const paragraph = new Paragraph(`Datalet name : ${this.component}`);
         const dateText = new TextRun("Github is the best").tab().bold();
         paragraph.addRun(dateText);*/
    }

    save_as_csv() {
        this.shadow_root.querySelector('#save_as-placeholder').style.display = 'none';
        this.save_csv(this.CSV, 'full_dataset');
    }

    save_as_csv2() {
        this.shadow_root.querySelector('#save_as-placeholder').style.display = 'none';
        this.save_csv(this.FCSV, 'filtered_dataset');
    }

    async import_myspace() {
        this.shadow_root.querySelector('#save_as-placeholder').style.display = 'none';

        let params = {};

        for (let i = 0; i < this.attributes.length; i++)
            params[this.attributes[i].name] = this.attributes[i].value;

        let data = params["data"];
        delete params["fields"];
        delete params["data"];

        params = JSON.stringify(params);
        let post = 'component=' + this.component;
        post += '&params=' + encodeURIComponent(params);
        post += '&data=' + encodeURIComponent(data);

        let res = await this.ajax_request("POST", ODE.ajax_private_room_datalet, 'responseText', JSON.parse,
            [["Content-type", "application/x-www-form-urlencoded; charset=UTF-8"],
                ["Accept", "application/json, text/javascript, */*; q=0.01"],
                ["X-Requested-With", "XMLHttpRequest"]], null, post);

        if (res.status === "ok")
            alert("Datalet added to Myspace");//todo cool panel + ln
        else
            alert("Error");
    }

    // SUB-MENU

    preview_resize(w = null, h = null) {
        let iframe = this.shadow_root.querySelector("#img-iframe");
        let pw     = this.shadow_root.querySelector("#preview_width");
        let ph     = this.shadow_root.querySelector("#preview_height");

        if(w == null) {
            w = pw.value;
            h = ph.value;
        }

        if(w === '100%' || w === '') {
            pw.value = '';
        } else if (w && !isNaN(w)) {
            pw.value = w;
            w += 'px';
        }
        else {
            w = +pw.value;

            if(isNaN(w) || w < 400) {
                w = 400;
                pw.value = w;
            }
            w += 'px';
        }

        if(h === '100%' || h === '') {
            ph.value = '';
        } else if (h && !isNaN(h)) {
            ph.value = h;
            h += 'px';
        }
        else {
            h = +ph.value;

            if(isNaN(h) || h < 400) {
                h = 400;
                ph.value = h;
            }
            h += 'px';
        }

        iframe.style.width = w;
        iframe.style.height = h;
    }

    preview_defaults(e) {
        let t = e.currentTarget;
        let val = t.options[t.selectedIndex].value;
        let h, w;

        switch(val) {
            case 'facebook':
                w = 1024;
                h = 512;
                break;
            case 'twitter':
                w = 1200;
                h = 630;
                break;
            case 'linkedin':
                w = 1200;
                h = 1200;
                break;
            case 'instagram':
                w = 1080;
                h = 1080;
                break;
            case 'pinterest':
                w = 600;
                h = 900;
                break;
            // case 'custom':
            //     w = 600;
            //     h = 400;
            //     break;
            default:
                w = '100%';
                h = '100%';
        }

        this.preview_resize(w, h);
    }

    async save_as_png() {
        // this.shadow_root.querySelector('#img-placeholder').style.display = 'none';

        let svg = this.shadow_root.querySelector('#img-iframe').contentWindow.document.querySelector(this.component).shadowRoot.querySelector('svg');
        let png = await this.create_image(svg);

        let download = document.createElement('a');
        download.href = png;
        download.download = `${this.component}.png`;
        document.body.appendChild(download);
        download.click();
        document.body.removeChild(download);
    }

    create_image(svg) {
        return new Promise((res, rej) =>
        {
            let svgData = new XMLSerializer().serializeToString(svg);

            let canvas = document.createElement("canvas");
            let svgSize = svg.getBoundingClientRect();
            canvas.width = svgSize.width;
            canvas.height = svgSize.height;
            let ctx = canvas.getContext("2d");

            let img = document.createElement("img");
            img.setAttribute("src", "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData))));

            img.onload = () => {
                ctx.drawImage(img, 0, 0); //ctx.drawImage(img, 0, 0, 800, 200); // RESIZE
                let png = canvas.toDataURL("image/png", 1); //formato, qualità
                res(png);
            }
        });
    }

    save_csv(csv, name) {
        let csvContent = "data:text/csv;charset=utf-8,";
        csv.forEach(function(rowArray){
            let row = Object.values(rowArray).join(",");
            csvContent += row + "\r\n";
        });

        let encodedUri = encodeURI(csvContent);
        // window.open(encodedUri);
        let link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", name+".csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // SHARE

    share_on_fb() {
        let facebook_url = this.create_share_url();
        let url = 'https://www.facebook.com/dialog/share?app_id=' + ODE.fb_app_id + '&display=popup&href=' + facebook_url + '&redirect_uri=' + facebook_url;
        window.open(url, "", "width=800,height=300");
    }

    share_on_twitter() {
        let base_url = ODE.ow_url_home;
        let twitter_url = this.create_share_url();
        let twitter_text = encodeURI((this.datalettitle ? (this.datalettitle + ' ') : '') + (this.description ? this.description : ''));
        let url = 'https://twitter.com/intent/tweet?text=' + twitter_text + '&via=RouteToPA&url=' + twitter_url + '&original_referer=' + base_url;
        window.open(url, "", "width=800,height=300");
    }

    // TOOLS

    get_datalet_id() {
        let parent = this.parentElement;

        while (!parent.hasAttribute("datalet-id"))
            parent = parent.parentElement;

        return parent.attributes["datalet-id"].value;
    }

    get_post_id() {
        let post_id = this.parentElement.id.match(/\d+/);
        return post_id ? post_id[0] : "";
    }

    ajax_request(method, path, response_obj, handle_response, requestHeader, responseType, data) {
        return new Promise((res, rej) => {
            requestHeader = requestHeader || [];
            data = data || {};

            let xhr = new XMLHttpRequest();

            xhr.onreadystatechange = function () {
                if (this.readyState === 4 && this.status === 200) {
                    if (handle_response)
                        res(handle_response(this[response_obj]));
                    else
                        res(this[response_obj]);
                }
            };

            xhr.open(method, path, true);

            for (let i = 0; i < requestHeader.length; i++)
                xhr.setRequestHeader(requestHeader[i][0], requestHeader[i][1]);

            if (responseType)
                xhr.responseType = responseType;

            xhr.send(data);
        });
    }

    requestLiveData() {
        this.removeAttribute("data");
        this.cache = undefined;
        this.work_cycle();

        this.shadow_root.querySelector('#live').innerHTML =  LN.translate("live");
        this.shadow_root.querySelector('#live').setAttribute("data-balloon", LN.translate("data_is_live"));
    }

    build_uri(resource, baseURI) {
        if (this.is_absolute_path(resource))
            return resource;

        return (baseURI || this.baseUri) + resource;
    }

    replace_img_path(innerHTML, baseURI) {
        [...innerHTML.querySelectorAll('img')].forEach((img) => {
            if (!this.is_absolute_path(img.attributes["src"].value))
                img.src = (baseURI || this.baseUri) + img.attributes["src"].value;
        });

        return innerHTML;
    }

    is_absolute_path(path) {
        return (path.indexOf('http') >= 0);
    }

    get_dynamic_import() {
        try {
            return new Function('url', 'return import(url)');
        } catch (err) {
            return importModule;
        }
    }

    get_html() {
        let script = `<script src="${this.baseUri}../lib/vendors/webcomponents_lite_polyfill/webcomponents-lite.js"></script>`;
        let style = `<style>html,body{margin:0;padding:0;height: 100%} ${this.component}{--base-datalet-visibility: none; --datalet-container-size:100%}</style>`;
        //let style = `<style>html{height: 100%;} body{height: calc(100% - 16px); margin: 8px;} ${this.component}{--fullscreen-visibility: none;}</style>`;
        let datalet_definition = `<link rel="import" href="${this.baseUri}${this.component}.html" />`;

        let temp = document.createElement('div');
        temp.innerHTML = this.outerHTML;
        let component = temp.firstChild;
        component.removeAttribute("data");

        return {script: script, style: style, datalet_definition: datalet_definition, component: component.outerHTML};
    }

    create_share_url() {
        let datalet_id = this.get_datalet_id();
        let base_url = ODE.ow_url_home;
        return base_url + 'datalet/' + datalet_id;
    }

    thereis_jQuery() {
        return (typeof jQuery === 'function')
    }

    render_error() {
        this.shadow_root.querySelector("#ajax_error").innerHTML = LN.translate("error")+"<i class='fas fa-bug'></i>";
    }

    parse_error(e) {
        // todo
        console.log(e);
    }

    merge_deep(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();

        if (this.is_object(target) && this.is_object(source)) {
            for (const key in source) {
                if (this.is_object(source[key])) {
                    if (!target[key]) Object.assign(target, {[key]: {}});
                    this.merge_deep(target[key], source[key]);
                } else {
                    Object.assign(target, {[key]: source[key]});
                }
            }
        }
        return this.merge_deep(target, ...sources);
    }

    is_object(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    redraw() {
        window.dispatchEvent(new Event('resize'));
    }

    translate() {
        LN.init();

        let save_as = this.shadow_root.querySelector('#export_menu');
        save_as.setAttribute("data-balloon", LN.translate("save_as"));

        let copy_link = this.shadow_root.querySelector('#link');
        copy_link.setAttribute("data-balloon", LN.translate("copy_link"));

        let embed = this.shadow_root.querySelector('#embed');
        embed.setAttribute("data-balloon", LN.translate("copy_html"));

        let fullscreen = this.shadow_root.querySelector('#fullscreen');
        fullscreen.setAttribute("data-balloon", LN.translate("fullscreen"));


        let save_as_image = this.shadow_root.querySelector('#save_as_image');
        save_as_image.innerHTML = LN.translate("image");

        let save_as_doc = this.shadow_root.querySelector('#save_as_doc');
        save_as_doc.innerHTML =LN.translate("document");

        let save_as_full_dataset = this.shadow_root.querySelector('#save_as_full_dataset');
        save_as_full_dataset.innerHTML = LN.translate("full_csv");

        let save_as_filtered_dataset = this.shadow_root.querySelector('#save_as_filtered_dataset');
        save_as_filtered_dataset.innerHTML = LN.translate("filtered_csv");

        let save_in = this.shadow_root.querySelector('#save_in');
        save_in.innerHTML = LN.translate("save_in");
        let myspace = this.shadow_root.querySelector('#myspace');
        myspace.innerHTML = LN.translate("my_space");


        let preview_width = this.shadow_root.querySelector("#label_width");
        preview_width.innerHTML = LN.translate("width");

        let preview_height = this.shadow_root.querySelector("#label_height");
        preview_height.innerHTML = LN.translate("height");

        let preview_presets = this.shadow_root.querySelector("#label_presets");
        preview_presets.innerHTML = LN.translate("presets");

        let preview_download = this.shadow_root.querySelector("#label_download");
        preview_download.innerHTML = LN.translate("download");


        let data_source_span = this.shadow_root.querySelector("#data_source_span");
        data_source_span.innerHTML = LN.translate("data_source");

        let data_source = this.shadow_root.querySelector("#data_source");
        data_source.setAttribute("data-balloon", LN.translate("data_source_b"));

        let data_link_span = this.shadow_root.querySelector("#data_link_span");
        data_link_span.innerHTML = LN.translate("data");

        let data_link = this.shadow_root.querySelector("#data_link");
        data_link.setAttribute("data-balloon", LN.translate("data_b"));


        if(!this.cache) {
            this.shadow_root.querySelector('#live').innerHTML =  LN.translate("live");
            this.shadow_root.querySelector('#live').setAttribute("data-balloon", LN.translate("data_is_live"));
        } else {
            this.shadow_root.querySelector('#live').innerHTML =  LN.translate("cache");
            this.shadow_root.querySelector('#live').setAttribute("data-balloon", LN.translate("disable_cache"));
        }
    }
};