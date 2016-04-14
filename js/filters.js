// Flexible Filters with Isotope
// author: mocxd (//mocxd.github.io)
// requires JQuery (http://jquery.com/) and Isotope (http://isotope.metafizzy.co/) in prior load order
$(function() {
    // config options
    // see docs (//somewhere)
    var jsBindings = {
        grid            : '.b-isotope',     // selector to bind the isotope grid to
        uiBase          : '.b-filter-ui',   // selector to bind the parent element of all containers / ui elements on page
        uiContainer     : '.b-filter-ui-container', // selector for ui container elements
        ui              : '.b-filter, .b-filter option' // selector to bind the ui element(s) to
    },

    jsOptions = {                           // names for template-configurable options. e.g. class="js-some-option"
        // for ui base
        and             : 'js-and',
        or              : 'js-or',

        // for ui containers
        multiSelect     : 'js-multi',       // multiple select option, otherwise defaults to single select

        // for ui elements
        click           : 'js-click',       // binds filter behavior to click event
        change          : 'js-change',      // binds filter behavior to change event
        clearFilters    : 'js-clear',       // clears other filters when this filter is selected (useful for multi select)
        clearAllFilters : 'js-clear-all',   // clears all filters in uiBase when this filter is selected
        defaultFilter   : 'js-default',     // default filter to select on page load
        selectedClass   : 'm-active',       // class to toggle on ui control if selected (added automatically)

        // for grid element
        preFilter       : 'js-pre-filter',  // sets results to pre-filter on page load (ignores location.search)

        // etc
        filterOn        : 'data-filter'     // attribute name to be used for determining filter string(s)
    },

    isotopeDefaults = {                     // default options for isotope. these can be overwritten with corresponding jsOptions
        itemSelector    : '.b-result-item',
        layoutMode      : 'fitRows',
        sortBy          : 'category'
    },

        searchKey   = 'filter',             // location.search key name to be used for url-based filtering
        $uiBase     = $(jsBindings.uiBase),
        $grid       = $(jsBindings.grid),
        $ui         = $(jsBindings.ui);


    // returns value of key param from location.search, or false
    var getSearch = function(param) {
        var q = location.search.substr(1),
        result = false;

        q.split('&').forEach(function(part) {
            var item = part.split('=');

            if (item[0] == param) {
                result = decodeURIComponent(item[1]);

                if (result.slice(-1) == '/') {
                    result = result.slice(0, -1);
                }
            }
        });
        return result;
    };

    // sets value for key param in location.search asynchronously, while preserving other keys if present
    var setSearch = function(param, value) {
        var q = location.search.substr(1),
        map = [],
        a = [],
        contains = false;

        if (q !== '') {
            q.split('&').forEach(function(part) {
                var k = (part.split('=')[0]),
                v = part.split('=')[1],
                o = {};

                if (part.split('=')[0] == param) {
                    v = encodeURIComponent(value);
                    contains = true;
                }

                o[k] = v;
                map.push(o);
            });
        }

        if (!contains) {
            var o = {};
            o[param] = encodeURIComponent(value);
            map.push(o);
        }

        map.forEach(function(v, i) {
            a[i] = Object.keys(v)[0] + '=' + v[Object.keys(v)[0]];
        });
        search = a.join('&');

        history.replaceState(
            { filtering : true },
            document.title + ' - filtering: ' + value,
            location.href.substr(0, location.href.indexOf('?') === -1 ? location.href.length : location.href.indexOf('?')) + '?' + search
            );
    };

    // filter on value f, or on * if no arguments are provided
    var filter = function(f = '*', grid = $grid) {
        // everything is nothing
        if (f === '') {
            f = '*';
        }

        // if f doesn't seem like a css selector
        // (i.e. it has no css selector syntax punctuation, and is a single word),
        // it will be converted to a simple class selector.  this is mainly to provide an easy way to do
        // something like data-filter="thing", since we usually don't care about filtering on element types
        if (!(/[*.~+>#=:()\[\]\s]/g.test(f))) {
            f = '.' + f;
        }

        grid.isotope({
            filter: f
        });
    };

    // update filter from UI state
    // deals with things like filter string building, etc. that are only important from UI
    // selectFilterUI should always be run first when changing the selected filters, as fitlering is based
    // on the current state of ui
    // --possibly move to model-viewmodel pattern--
    var updateFilter = function(ui = $ui, uiBase = $uiBase, skey = searchKey, options = jsOptions) {
        var compoundFilter = '';

        ui.each(function (i) {
            var $this = $(this);
            if ($this.hasClass(options.selectedClass)) {
                var f = $this.attr(options.filterOn);

                // treat unadorned string as class instead of element
                if (!(/[*.~+>#=:()\[\]\s]/g.test(f))) {
                    f = '.' + f;
                }

                // treat *, **, ***, etc as nothing
                if (/^[*]+$/g.test(f)) {
                    f = '';
                }

                // &&
                if ($uiBase.hasClass(options.and)) {
                    compoundFilter += f;
                }
                // ||
                else if ($uiBase.hasClass(options.or)) {
                    compoundFilter += (compoundFilter === '' ? '' : ',') + f;
                }
                else {
                    // default to &&
                    compoundFilter += f;
                }
            }
        });

        // update filter to value f in location.search, and then filter
        setSearch(skey, compoundFilter);
        filter(compoundFilter);
    };

    // select UI component(s) based on filter value
    // this needs to be done from filter value primarily to support selecting proper UI elements from
    // the value of location.search url filter
    var selectFilterUI = function(f, ui = $ui, uiBase = $uiBase, bindings = jsBindings, options = jsOptions) {
        var parsedf;
        // parse compound string
        if ($uiBase.hasClass(options.and)) {
            parsedf = f.split('.');
        } else if ($uiBase.hasClass(options.or)) {
            parsedf = f.split(',');
            for (var i in parsedf) {
                parsedf[i].replace(/^\./, '');
            }
        } else {
            parsedf = f.split('.');
        }

        ui.each(function(i) {
            var $this = $(this);

            if (parsedf.indexOf($this.attr(options.filterOn)) >= 0) {
                // if options.clearAllFilters is present,
                // remove selectedClass from others within the container if multiSelect option is enabled,
                // and add it to $this. if there is no container for $this, we assume single select
                var c = $this.closest(bindings.uiContainer),
                uiBase = $this.closest(bindings.uiBase),
                toggle = false;
                if (c.length > 0 && c.hasClass(options.multiSelect)) {
                    if ($this.hasClass(options.clearFilters)) {
                        c.children().removeClass(options.selectedClass);
                    } else if ($this.hasClass(options.clearAllFilters)) {
                        if (uiBase.length > 0) {
                            uiBase.find(bindings.uiContainer + ', ' + bindings.ui)
                            .removeClass(options.selectedClass);
                        }
                    } else {
                        c.children('.' + options.clearFilters).removeClass(options.selectedClass);
                        toggle = true;
                    }
                } else if (c.length === 0) {
                    // no container, remove all selectedClass from previously selected non-contained elements
                    // functionally a single select amongst all ui elements that are not contained
                    var u = bindings.ui.split(',');
                    for (var i in u) {
                        u[i] = bindings.uiContainer + ' ' + u[i].trim();
                    }
                    u = u.join(',');
                    ui.not(u).removeClass(options.selectedClass);
                } else { // single select
                    c.find(bindings.ui).removeClass(options.selectedClass);
                }

                if (!$this.hasClass(options.clearAllFilters)) {
                    uiBase.find('.' + options.clearAllFilters).removeClass(options.selectedClass);
                }

                if (toggle) {
                    $this.toggleClass(options.selectedClass);
                } else {
                    $this.addClass(options.selectedClass);
                }
            }
        });
    };

    // filters on location.search (pre-filtered grids ignore)
    // this will also select the corresponding ui filter(s), if available
    var urlFilter = function(skey = searchKey, grid = $grid, options = jsOptions) {
        var f = getSearch(skey);
        if (!f || grid.hasClass(options.preFilter)) {
            return;
        }
        console.log('url filtering', f);
        filter(f);
        selectFilterUI(f);
    };

    // pre-filters results if preFilter option is enabled in $grid
    // this will also select the corresponding ui filter(s), if available
    var preFilter = function(ui = $ui, grid = $grid, options = jsOptions) {
        var f = grid.attr(options.filterOn);
        if (!grid.hasClass(options.preFilter)) {
            return;
        }
        console.log('pre filtering', f);
        filter(f);
        selectFilterUI(f);
    };

    // run filter based on the default ui control and select that control
    var defaultFilter = function (ui = $ui, options = jsOptions) {
        ui.each(function(i) {
            var $this = $(this);
            if ($this.hasClass(options.defaultFilter)) {
                var f = $this.attr(options.filterOn);
                filter(f);
                selectFilterUI(f);
            }
        });
    };

    // binds filters to ui controls
    var bindUI = function(ui = $ui, grid = $grid, options = jsOptions) {
        ui.each(function(i) {
            var $this = $(this);
            var boundEvent = 'click'; // use this event by default

            // figure out what event to bind to
            if ($this.hasClass(options.click)) {
                boundEvent = 'click';
            } else if ($this.hasClass(options.change)) {
                boundEvent = 'change';
            }

            // set up handler for that event
            $this.on(boundEvent, function() {
                var f;

                if (boundEvent === 'change') {
                    f = $this.children(':selected').attr(options.filterOn)
                } else {
                    f = $this.attr(options.filterOn);
                }

                // update the filter (which also updates the current location.search string for permalinking)
                selectFilterUI(f);
                updateFilter();
            });
        });
    };

    // initialize isotope
    $grid.isotope(isotopeDefaults);

    // bind controls and execute any filtering needed at page load time
    // arguments default to config settings, but can be overridden for more complex page behavior
    bindUI();
    defaultFilter();
    urlFilter();
    preFilter();

});