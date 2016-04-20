$(function() {
    var index, papers;

    var getx = function (arr, prop, needle) {
        console.log (prop, needle);
        for (i in arr) {
            if (arr[i][prop] === needle) {
                console.log(arr[i]);
                return arr[i];
            }
        }
    };

    var mapResults = function (fromHaystack, toHaystack, mapFrom, mapTo) {
        var results = [];
        for (i in fromHaystack) {
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
        $( '.b-lunr-results' ).text( JSON.stringify(

            mapResults(index.search($('#lunr-search').val()), papers, 'ref', 'id')

            ));
    };

    var debouncedSearch = _.debounce(search, 100, false)

    $('#lunr-search').keyup(debouncedSearch);

});