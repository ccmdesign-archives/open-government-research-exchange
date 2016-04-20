$(function() {
    var index, papers;

    var getx = function (arr, prop, needle) {
        console.log (prop, needle);
        for (var i in arr) {
            if (arr[i][prop] === needle) {
                console.log(arr[i]);
                return arr[i];
            }
        }
    };

    var mapResults = function (fromHaystack, toHaystack, mapFrom, mapTo) {
        var results = [];
        for (var i in fromHaystack) {
            console.log (fromHaystack, mapFrom, fromHaystack[i][mapFrom]);
            results.push(getx(toHaystack, mapTo, fromHaystack[i][mapFrom]));
        }
        return results;
    }

    $.get( 'js/searchindex.json', function( d ) {
        index = lunr.Index.load(d.index);
    })
    .fail(function() {
        $( '.b-lunr-results' ).text( 'Could not get searchindex.json' );
    });

    $.get( 'js/searchindex.json', function( d ) {
        papers = d.store;
    })
    .fail(function() {
        $( '.b-lunr-results' ).text( 'Could not get papers.json' );
    });

    var search = function (e) {
        // $( '.b-lunr-results' ).text( JSON.stringify(index.search($('#lunr-search').val())) );

        var mapping = mapResults(index.search($('#lunr-search').val()), papers, 'ref', 'id'), resultsHTML = '';

        for (var m in mapping) {
            resultsHTML += '\n<h3>' + mapping[m].title + '</h3>\n<p>' + mapping[m].abstract.substring(0, 250) + '... </p>';
        }

        $( '.b-lunr-results' ).html(resultsHTML);
    };

    var debouncedSearch = _.debounce(search, 100, false)

    $('#lunr-search').keyup(debouncedSearch);

});