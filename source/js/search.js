$(function() {
    var index, papers, scopes, scopedIndices = {}, resultSnippet;

    var slug = function (t) {
        return t ? t.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        : false ;
    }

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

    var getx = function (arr, prop, needle) {
        for (var i in arr) {
            if (arr[i][prop] === needle) {
                return arr[i];
            }
        }
    };

    var mapResults = function (fromHaystack, toHaystack, mapFrom, mapTo) {
        var results = [];
        for (var i in fromHaystack) {
            results.push(getx(toHaystack, mapTo, fromHaystack[i][mapFrom]));
        }
        return results;
    }

    // get data //////////////////////////////

    $.get( 'js/searchindex.json', function( d ) {
        index = lunr.Index.load(d.index);
        papers = d.papers;

        $.get( '_rendered_result_item.html', function( d ) {
            resultSnippet = d;

            // after loading the index, grab the search string, if present
            // and inject into the search field and run the search
            var s = getSearch('s').replace('+', ' ');
            if (s) {
                $('#lunr-search').val(s);
                $('#lunr-search').trigger('search:execute');
            }
        })
        .fail(function() {
            console.log ( 'Could not get _rendered_result_item.html!' );
        });

    })
    .fail(function() {
        console.log ( 'Could not get searchindex.json!' );
    });

    $.get( 'js/scopes.json', function( d ) {
        scopes = d;

        for (var s in scopes) {
            scopes[s].custom_filter &&
            getIndex(slug(scopes[s].custom_filter));
        }
    })
    .fail(function() {
        console.log ('Could not get available scopes!');
    });

    var getIndex = function (name) {
        $.get( 'js/searchindex-' + name + '.json', function( d ) {
            scopedIndices[name] = lunr.Index.load(d.index);
        })
        .fail(function() {
            console.log('Could not $.get scoped index : ' + name);
        });
    }

    //////////////////////////////////////////

    var search = function (e) {
        var mapping = mapResults(index.search($(this).val()), papers, 'ref', 'id'), resultsHTML = '';



        for (var m in mapping) {
            // inject the result snippet with the mapped data
            var $snippet = $(resultSnippet);
            $snippet.find('.e-result-name').text(mapping[m].title);
            $snippet.find('.e-result-authors').text(mapping[m].authors);

            $snippet.find('.e-result-taxonomy.m-category').html(
                '<span>' +
                mapping[m].taxonomy.category.join('</span> <span>')
                + '</span>'
                );

            $snippet.find('.e-result-taxonomy.m-methodology').html(
                '<span>' +
                mapping[m].taxonomy.methodology.join('</span> <span>')
                + '</span>'
                );

            $snippet.find('.e-result-taxonomy.m-objective').html(
                '<span>' +
                mapping[m].taxonomy.objective.join('</span> <span>')
                + '</span>'
                );

            $snippet.find('.m-closed-access').remove();

            if (mapping[m].access.toLowerCase() === 'closed') {
               $snippet.find('.e-result-extras').append('<i class="material-icons m-closed-access" title="Closed Access">lock_outline</i>')
            }

            resultsHTML += $snippet.prop('outerHTML');
        }

        $( '.b-lunr-results' ).html(resultsHTML);
    };

    var filter = function (e) {
        // $( '.b-lunr-results' ).text( JSON.stringify(index.search($('#lunr-search').val())) );


        var results = scopedIndices[$(this).attr('data-category')].search($(this).val()),
        limit = 50;

        // console.log ($(this).attr('data-category'), $(this).val(), results, scopedIndices[$(this).attr('data-category')]);

        if (results.length > limit) {
            results = results.slice(0, limit);
        }

        $( document ).trigger( 'filter:removeClassesContaining', [ 'f-search-' ] );

        for (var r in results) {
            if (r == 0) {
                $( document ).trigger( 'filter:add', [ '.f-search-' + results[r].ref ] );
            } else {
                $( document ).trigger( 'filter:addOR', [ '.f-search-' + results[r].ref ] );
            }
        }

        $( document ).trigger( 'filter:update' );

    }

    var debouncedSearch = _.debounce(search, 100, false);
    var debouncedFilter = _.debounce(filter, 1000, false);

    $('#lunr-search').keyup(debouncedSearch);
    $('#lunr-search').on('search:execute', debouncedSearch);
    $('#lunr-filter').keyup(debouncedFilter);

});